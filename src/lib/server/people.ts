import type { RequestEvent } from '@sveltejs/kit'
import { hashHex } from './image'

export type Person = { id: string; name: string; atlas: boolean; moderator: boolean; banned: boolean }
type Row = { id: string; name: string; atlas_sub: string | null; role: string; banned_at: string | null }

export const SESSION_COOKIE = '__Host-ug.session'
export function secureOrigin(event: Pick<RequestEvent, 'url'>) {
  if (event.url.protocol === 'https:') return true
  if (event.url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(event.url.hostname)) return false
  throw new Error('Insecure origin')
}
export const sessionName = (event: Pick<RequestEvent, 'url'>) => secureOrigin(event) ? SESSION_COOKIE : 'ug.session'
const YEAR = 60 * 60 * 24 * 365

const shape = (row: Row): Person => ({ id: row.id, name: row.name, atlas: Boolean(row.atlas_sub), moderator: row.role === 'moderator', banned: Boolean(row.banned_at) })
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
export const newSessionToken = () => randomHex(32)

export async function personOf(db: D1Database, token: string | undefined): Promise<Person | null> {
  if (!token) return null
  const row = await db.prepare(`SELECT p.id, p.name, p.atlas_sub, p.role, p.banned_at, s.created_at FROM sessions s JOIN people p ON p.id = s.person WHERE s.token_hash = ?`)
    .bind(await hashHex(token)).first<Row & { created_at: string }>()
  if (!row) return null
  const created = Date.parse(row.created_at)
  const now = Date.now()
  // Sessions are written as UTC ISO timestamps. Reject invalid and future dates.
  if (!Number.isFinite(created) || new Date(created).toISOString() !== row.created_at || created > now || created <= now - YEAR * 1000) return null
  return shape(row)
}

export async function createPerson(db: D1Database, atlasSub: string | null = null, name?: string) {
  const id = randomHex(6)
  const at = new Date().toISOString()
  const row = { id, name: name || `anon-${id.slice(0, 6)}`, atlas_sub: atlasSub, role: 'member', banned_at: null }
  await db.prepare('INSERT INTO people(id, name, atlas_sub, created_at) VALUES(?,?,?,?)').bind(id, row.name, atlasSub, at).run()
  return shape(row)
}

export async function startSession(db: D1Database, personId: string) {
  const token = randomHex(32)
  const now = Date.now()
  const cutoff = new Date(now - YEAR * 1000).toISOString()
  await db.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE created_at <= ? ORDER BY created_at LIMIT 100)').bind(cutoff).run()
  await db.prepare('INSERT INTO sessions(token_hash, person, created_at) VALUES(?,?,?)').bind(await hashHex(token), personId, new Date(now).toISOString()).run()
  return token
}

// Consume the presented account session and issue its replacement in one transaction.
export async function rotateSession(db: D1Database, old: string, from: string, to: string) {
  const token = randomHex(32)
  const now = Date.now()
  const [result] = await db.batch([
    db.prepare('INSERT INTO sessions(token_hash, person, created_at) SELECT ?, ?, ? FROM sessions WHERE token_hash = ? AND person = ? AND created_at > ? AND created_at <= ? RETURNING token_hash')
      .bind(await hashHex(token), to, new Date(now).toISOString(), await hashHex(old), from, new Date(now - YEAR * 1000).toISOString(), new Date(now).toISOString()),
    db.prepare('DELETE FROM sessions WHERE token_hash = ? AND changes() > 0').bind(await hashHex(old)),
  ])
  if (!result.results.length) throw new Error('Session ended during sign-in')
  return token
}

export async function endSession(db: D1Database, token: string | undefined) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashHex(token)).run()
}

export const sessionCookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: YEAR } as const

// The person writing: the one this browser already is, or a new anonymous one from this first write on.
export async function writer(event: RequestEvent, db: D1Database) {
  if (event.locals.person) return event.locals.person
  const person = await createPerson(db)
  event.cookies.set(sessionName(event), await startSession(db, person.id), { ...sessionCookie, secure: event.url.protocol === 'https:' })
  event.locals.person = person
  return person
}

// An agent has no cookie jar. Its connection carries the token the endpoint handed it, and its first write
// makes the anonymous person that token names from then on. The token is kept under a name of its own,
// so it never stands for a browser's cookie, nor a cookie for it: an agent's person cannot be signed in.
export const AGENT_SESSION = 'mcp-session-id'
export function agentToken(request: Request) {
  const token = request.headers.get(AGENT_SESSION)
  return token && /^[0-9a-f]{64}$/.test(token) ? `mcp:${token}` : undefined
}
export async function agentWriter(event: RequestEvent, db: D1Database) {
  if (event.locals.person) return event.locals.person
  let person = await createPerson(db)
  const token = agentToken(event.request)
  if (token) {
    const hash = await hashHex(token), at = Date.now()
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE token_hash = ? AND created_at <= ?').bind(hash, new Date(at - YEAR * 1000).toISOString()),
      db.prepare('INSERT OR IGNORE INTO sessions(token_hash, person, created_at) VALUES(?,?,?)').bind(hash, person.id, new Date(at).toISOString()),
    ])
    // Two first writes of one connection may run together. The person whose token was kept stands for both.
    const held = await personOf(db, token)
    if (held && held.id !== person.id) {
      await db.prepare('DELETE FROM people WHERE id = ?').bind(person.id).run()
      person = held
    }
  }
  event.locals.person = person
  return person
}

export const NAME_MAX = 40
export function cleanName(text: unknown) {
  const name = String(text ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
  return name.length >= 1 && name.length <= NAME_MAX ? name : null
}

// A person signs in through Glyph Atlas: this browser's anonymous person, if any, joins the account's.
export async function joinAtlas(db: D1Database, current: Person | null, sub: string, atlasName: string, session?: string, replacement?: string) {
  if (current && !current.atlas && !session) throw new Error('Missing session')
  const sessionHash = session ? await hashHex(session) : ''
  const replacementHash = replacement ? await hashHex(replacement) : null
  const finish = (source: string, target: string) => replacementHash ? [
    db.prepare('INSERT INTO sessions(token_hash, person, created_at) SELECT ?, ?, ? WHERE changes() > 0').bind(replacementHash, target, new Date().toISOString()),
    db.prepare('DELETE FROM sessions WHERE person = ? AND token_hash <> ? AND changes() > 0').bind(source, replacementHash),
  ] : [db.prepare('DELETE FROM sessions WHERE person = ? AND changes() > 0').bind(source)]
  const held = await db.prepare('SELECT id FROM people WHERE atlas_sub = ?').bind(sub).first<{ id: string }>()
  if (!held && current && !current.atlas) {
    // A first sign-in keeps the person, so a name already chosen here stays.
    const [result] = await db.batch([
      db.prepare('UPDATE people SET atlas_sub = ? WHERE id = ? AND atlas_sub IS NULL AND merged_into IS NULL AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND person = people.id) RETURNING id').bind(sub, current.id, sessionHash),
      ...finish(current.id, current.id),
    ])
    if (!result.results.length) throw new Error('Identity changed during sign-in')
    return current.id
  }
  const id = held?.id ?? (await createPerson(db, sub, atlasName)).id
  if (current && !current.atlas && current.id !== id) {
    const [result] = await db.batch([
      db.prepare('UPDATE people SET merged_into = ? WHERE id = ? AND atlas_sub IS NULL AND merged_into IS NULL AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND person = people.id) RETURNING id').bind(id, current.id, sessionHash),
      ...finish(current.id, id),
    ])
    if (!result.results.length) throw new Error('Identity changed during sign-in')
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO favourites(person, entry_id, at) SELECT ?, entry_id, at FROM favourites WHERE person = ?').bind(id, current.id),
      db.prepare('DELETE FROM favourites WHERE person = ?').bind(current.id),
      // A notice both people hold of one thing stays the account's own.
      db.prepare('UPDATE OR IGNORE notifications SET person = ? WHERE person = ?').bind(id, current.id),
      db.prepare('DELETE FROM notifications WHERE person = ?').bind(current.id),
    ])
  }
  return id
}
