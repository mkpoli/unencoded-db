import type { RequestEvent } from '@sveltejs/kit'
import { AGENT_UNKNOWN } from '$lib/agent'
import { hashHex } from './image'

// Who did something: an agent row shows as the person it is merged into, with the agent and its model beside them.
export const WHO = (column: string) => `LEFT JOIN people p ON p.id = ${column} LEFT JOIN people m ON m.id = p.merged_into`
export const WHO_COLUMNS = "COALESCE(m.id, p.id) AS by_id, COALESCE(m.name, p.name) AS by_name, CASE WHEN p.agent = 1 THEN p.name END AS by_agent, CASE WHEN p.agent = 1 THEN NULLIF(p.agent_model, '') END AS by_model"

export type Person = { id: string; name: string; atlas: boolean; moderator: boolean; banned: boolean }
type Row = { id: string; name: string; atlas_sub: string | null; role: string; banned_at: string | null }

export const SESSION_COOKIE = '__Host-ug.session'
export const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
export function secureOrigin(event: Pick<RequestEvent, 'url'>) {
  if (event.url.protocol === 'https:') return true
  if (event.url.protocol === 'http:' && loopback(event.url)) return false
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

/**
 * Resolves (or creates) an `agent = 1` person row merged under `commander` for automated scripts
 * and agents. Throws if `commander` is missing, merged, or itself an agent, or if `agent` is blank.
 */
export async function resolveAgentActor(
  db: D1Database,
  options: { agent: string; model?: string; commander: string },
): Promise<{ actor: string; ip: null }> {
  const agent = options.agent.normalize('NFC').replace(/\s+/gu, ' ').trim()
  const model = (options.model ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (agent.length < 1 || agent.length > 40) throw new Error('Agent name must be 1..40 characters')
  if (model.length > 80) throw new Error('Agent model must be at most 80 characters')
  const commander = await db
    .prepare('SELECT id, agent, merged_into FROM people WHERE id = ?')
    .bind(options.commander)
    .first<{ id: string; agent: number; merged_into: string | null }>()
  if (!commander || commander.agent !== 0 || commander.merged_into !== null) {
    throw new Error(`Invalid commander person: ${options.commander}`)
  }
  const existing = await db
    .prepare('SELECT id FROM people WHERE merged_into = ? AND agent = 1 AND name = ? AND agent_model = ? ORDER BY created_at DESC LIMIT 1')
    .bind(commander.id, agent, model)
    .first<{ id: string }>()
  if (existing) return { actor: existing.id, ip: null }
  const id = randomHex(6)
  await db
    .prepare('INSERT INTO people(id, name, agent, agent_model, merged_into, created_at) VALUES(?,?,1,?,?,?)')
    .bind(id, agent, model, commander.id, new Date().toISOString())
    .run()
  return { actor: id, ip: null }
}

/** Refuses any actor that is not an explicit `agent = 1` person row, so automation cannot write as a human. */
export async function assertAgentActor(db: D1Database, actor: string): Promise<void> {
  const row = await db.prepare('SELECT agent FROM people WHERE id = ?').bind(actor).first<{ agent: number }>()
  if (!row || row.agent !== 1) {
    throw new Error(`Refusing automated write as non-agent actor "${actor}"; use resolveAgentActor()`)
  }
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
/** What an agent says it is: the harness it runs in and the model it runs on. */
export type AgentSaid = { harness: string | null; model: string | null }

// Every write through the agent endpoint is an agent's, whether or not it says which. A signed-in agent
// writes as an agent row of the person who allowed it, one row for each harness and model. A connection
// that never signed in is an agent row of its own, and what it says later names the same row.
export async function agentWriter(event: RequestEvent, db: D1Database, said: AgentSaid = { harness: null, model: null }) {
  const name = said.harness ?? AGENT_UNKNOWN, model = said.model ?? ''
  const signed = event.locals.person
  if (signed) {
    const own = await db.prepare('SELECT agent, merged_into, atlas_sub, name, agent_model FROM people WHERE id = ?').bind(signed.id)
      .first<{ agent: number; merged_into: string | null; atlas_sub: string | null; name: string; agent_model: string }>()
    if (!own) return signed
    if (!own.atlas_sub && !own.merged_into) {
      const next = { name: said.harness ?? (own.agent ? own.name : AGENT_UNKNOWN), model: said.model ?? (own.agent ? own.agent_model : '') }
      if (!own.agent || next.name !== own.name || next.model !== own.agent_model) await db.prepare('UPDATE people SET agent = 1, name = ?, agent_model = ? WHERE id = ? AND atlas_sub IS NULL AND merged_into IS NULL').bind(next.name, next.model, signed.id).run()
      return signed
    }
    // An agent row someone joined to a person keeps the labels it was given.
    if (own.agent) return signed
    const held = await db.prepare('SELECT id FROM people WHERE merged_into = ? AND agent = 1 AND name = ? AND agent_model = ? LIMIT 1').bind(signed.id, name, model).first<{ id: string }>()
    if (held) return event.locals.person = { ...signed, id: held.id }
    const id = randomHex(6)
    await db.prepare('INSERT INTO people(id, name, created_at, merged_into, agent, agent_model) VALUES(?,?,?,?,1,?)').bind(id, name, new Date().toISOString(), signed.id, model).run()
    return event.locals.person = { ...signed, id }
  }
  let person = await createPerson(db, null, name)
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
  await db.prepare('UPDATE people SET agent = 1, agent_model = ? WHERE id = ? AND agent = 0 AND atlas_sub IS NULL AND merged_into IS NULL').bind(model, person.id).run()
  event.locals.person = person
  return person
}

export const NAME_MAX = 40
export function cleanName(text: unknown) {
  const name = String(text ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
  return name.length >= 1 && name.length <= NAME_MAX ? name : null
}

export const AGENT_NAME_MAX = 80
export function cleanAgentName(text: unknown) {
  const name = String(text ?? '').normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/gu, ' ').trim()
  return name.length >= 1 && name.length <= AGENT_NAME_MAX ? name : null
}

// What a person who joins another hands over: favourites, notices and the thanks they gave.
function belongings(db: D1Database, from: string, into: string, agent: string | null = null, model: string | null = null) {
  // Each statement acts only once `from` has joined `into`, so they ride in the batch that joins them.
  const joined = 'EXISTS (SELECT 1 FROM people WHERE id = ?1 AND merged_into = ?2)'
  // A thank that would now be someone's thanks for their own change, or a second thanks from one person.
  const spent = `SELECT k.id FROM thanks k JOIN revisions r ON r.id = k.revision_id JOIN people p ON p.id = r.actor
    WHERE (k.person IN (?1, ?2) AND COALESCE(p.merged_into, p.id) = ?2) OR (k.person = ?1 AND k.revision_id IN (SELECT revision_id FROM thanks WHERE person = ?2))`
  // People who had joined `from` follow it, so every join stays one step from the person it names.
  // When `from` joins as an agent, non-agent rows previously joined into it inherit the agent and
  // model labels, while rows already marked as agents keep their own names and models.
  const follow = agent
    ? db.prepare(`UPDATE people SET merged_into = ?2, name = CASE WHEN agent = 1 THEN name ELSE ?3 END, agent_model = CASE WHEN agent = 1 THEN agent_model ELSE ?4 END, agent = 1 WHERE merged_into = ?1 AND ${joined}`).bind(from, into, agent, model ?? '')
    : db.prepare(`UPDATE people SET merged_into = ?2 WHERE merged_into = ?1 AND ${joined}`).bind(from, into)
  return [
    follow,
    db.prepare(`INSERT OR IGNORE INTO favourites(person, entry_id, at) SELECT ?2, entry_id, at FROM favourites WHERE person = ?1 AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM favourites WHERE person = ?1 AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM notifications WHERE thank_id IN (${spent}) AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM thanks WHERE id IN (${spent}) AND ${joined}`).bind(from, into),
    db.prepare(`UPDATE thanks SET person = ?2 WHERE person = ?1 AND ${joined}`).bind(from, into),
    // A notice both people hold of one thing stays the joined person's own.
    db.prepare(`UPDATE OR IGNORE notifications SET person = ?2 WHERE person = ?1 AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM notifications WHERE person = ?1 AND ${joined}`).bind(from, into),
  ]
}

export type JoinRefusal = 'missing' | 'self' | 'banned' | 'agent' | 'model'

/** A moderator joins a person who never signed in to another, as signing in would. People already joined
 * to them follow, and their browsers and agents are signed out. Naming an agent (and optional model)
 * marks the merged row as an agent acting for the target while keeping those labels on its edits. */
export async function joinPerson(db: D1Database, from: string, into: string, options?: { agent?: string | null; model?: string | null }): Promise<JoinRefusal | null> {
  if (from === into) return 'self'
  const agent = options?.agent == null ? null : cleanAgentName(options.agent)
  if (options?.agent != null && !agent) return 'agent'
  const model = options?.model == null ? null : cleanAgentName(options.model)
  if (options?.model != null && (!model || !agent)) return 'model'
  const { results } = await db.prepare('SELECT id, atlas_sub, merged_into, banned_at FROM people WHERE id IN (?, ?)').bind(from, into)
    .all<{ id: string; atlas_sub: string | null; merged_into: string | null; banned_at: string | null }>()
  const source = results.find(row => row.id === from), target = results.find(row => row.id === into)
  if (!source || !target || source.atlas_sub || source.merged_into || target.merged_into) return 'missing'
  if (source.banned_at || target.banned_at) return 'banned'
  const joined = 'EXISTS (SELECT 1 FROM people WHERE id = ?1 AND merged_into = ?2)'
  const merge = agent
    ? db.prepare('UPDATE people SET merged_into = ?2, agent = 1, name = ?3, agent_model = ?4 WHERE id = ?1 AND atlas_sub IS NULL AND merged_into IS NULL AND banned_at IS NULL AND EXISTS (SELECT 1 FROM people WHERE id = ?2 AND merged_into IS NULL AND banned_at IS NULL) RETURNING id').bind(from, into, agent, model ?? '')
    : db.prepare('UPDATE people SET merged_into = ?2 WHERE id = ?1 AND atlas_sub IS NULL AND merged_into IS NULL AND banned_at IS NULL AND EXISTS (SELECT 1 FROM people WHERE id = ?2 AND merged_into IS NULL AND banned_at IS NULL) RETURNING id').bind(from, into)
  const [result] = await db.batch([
    merge,
    // Signing in shows that two people are one; a moderator's word does not carry what `from` was allowed
    // to do into `into`'s name, so its browsers and agents are signed out.
    db.prepare(`DELETE FROM sessions WHERE person = ?1 AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM agent_tokens WHERE person = ?1 AND ${joined}`).bind(from, into),
    db.prepare(`DELETE FROM agent_codes WHERE person = ?1 AND ${joined}`).bind(from, into),
    ...belongings(db, from, into, agent, model),
  ])
  if (!result.results.length) return 'missing'
  return null
}

export type AgentIdentity = { name: string; model: string | null }
export const AGENTS_MAX = 50
// Each distinct (agent, model) pair is sought in `people_agents_by_commander` with separate B-tree
// seeks for the next model within the current agent and the next agent name, so listing a
// commander's agents reads at most O(AGENTS_MAX) index entries regardless of duplicate rows.
export const agentsOfStatement = (db: D1Database, id: string) => db.prepare(`WITH RECURSIVE pairs(name, model, n) AS (
  SELECT
    (SELECT MIN(name) FROM people WHERE merged_into = ?1 AND agent = 1),
    (SELECT MIN(agent_model) FROM people WHERE merged_into = ?1 AND agent = 1 AND name = (SELECT MIN(name) FROM people WHERE merged_into = ?1 AND agent = 1)),
    1
  UNION ALL
  SELECT
    CASE
      WHEN (SELECT MIN(agent_model) FROM people WHERE merged_into = ?1 AND agent = 1 AND name = pairs.name AND agent_model > pairs.model) IS NOT NULL
        THEN pairs.name
      ELSE (SELECT MIN(name) FROM people WHERE merged_into = ?1 AND agent = 1 AND name > pairs.name)
    END,
    COALESCE(
      (SELECT MIN(agent_model) FROM people WHERE merged_into = ?1 AND agent = 1 AND name = pairs.name AND agent_model > pairs.model),
      (SELECT MIN(agent_model) FROM people WHERE merged_into = ?1 AND agent = 1 AND name = (SELECT MIN(name) FROM people WHERE merged_into = ?1 AND agent = 1 AND name > pairs.name))
    ),
    pairs.n + 1
  FROM pairs WHERE pairs.name IS NOT NULL AND pairs.n < ?2
) SELECT name, NULLIF(model, '') AS model FROM pairs WHERE name IS NOT NULL`).bind(id, AGENTS_MAX)

/** The distinct (agent, model) pairs merged under this contributor, in name and model order. */
export async function agentsOf(db: D1Database, id: string): Promise<AgentIdentity[]> {
  return (await agentsOfStatement(db, id).all<AgentIdentity>()).results
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
      ...belongings(db, current.id, id),
    ])
    if (!result.results.length) throw new Error('Identity changed during sign-in')
  }
  return id
}

/** A person's id is twelve hex digits; the first people of the catalogue hold a UUID. */
export const PERSON_ID = /^(?:[0-9a-f]{12}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/

/** The Glyph Atlas account a person signed in with, if they may be shown. */
export async function atlasSubOf(db: D1Database, id: string) {
  const row = await db.prepare('SELECT atlas_sub FROM people WHERE id = ? AND merged_into IS NULL AND banned_at IS NULL').bind(id).first<{ atlas_sub: string | null }>()
  return row?.atlas_sub ?? null
}

export const PEOPLE_PAGE = 100
// Pages past this are refused before the database is read, so an offset stays bounded.
export const PEOPLE_PAGES = 50

export type Contributor = { id: string; name: string; changes: number; atlas: number }

export function contributorsStatement(db: D1Database, page: number) {
  // The catalogue's own maintenance and automated Glyph Atlas sync are not human contributors.
  return db.prepare(`SELECT p.id, p.name, p.changes, p.atlas_sub IS NOT NULL AS atlas FROM people p
    WHERE p.merged_into IS NULL AND p.changes > 0 AND p.banned_at IS NULL AND p.name NOT IN ('Catalogue maintenance', 'Glyph Atlas')
    ORDER BY p.changes DESC, p.id LIMIT ? OFFSET ?`).bind(PEOPLE_PAGE + 1, (page - 1) * PEOPLE_PAGE)
}

/** Everyone with a change to show, most changes first. */
export async function contributors(db: D1Database, page: number) {
  const { results } = await contributorsStatement(db, page).all<Contributor>()
  return { people: results.slice(0, PEOPLE_PAGE), next: results.length > PEOPLE_PAGE && page < PEOPLE_PAGES ? page + 1 : null }
}
