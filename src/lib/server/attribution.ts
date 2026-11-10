import { fields, type Evidence } from './evidence'
import type { Comparison } from '$lib/comparison-rows'

const lifetimeSeconds = 60 * 60 * 24 * 365
const secureCookie = '__Host-contributor'
const localCookie = 'contributor-local'

// A hostname and protocol are taken from SvelteKit's request URL, never forwarding headers.
export function cookieOptions(url: URL) {
  if (url.protocol === 'https:') return { name: secureCookie, secure: true }
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) {
    return { name: localCookie, secure: false }
  }
  return null
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashToken(token: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
}

export type SourceImageMeta = { key: string; type: string; size: number }

/** A save that failed without committing anything, so the stored image is safe to delete. */
export class DefinitiveSaveFailure extends Error {}

export async function saveEvidence(db: D1Database, row: Evidence, token: string | undefined, comparisons: Comparison[] = [], image?: SourceImageMeta, meta?: { radical: string | null; encoded_as: string | null; strokes: number | null; ivd_status: string | null; ivd_sequence: string | null; equivalent_to: string | null }) {
  const columns = [...fields, ...(meta ? ['radical', 'encoded_as', 'strokes', 'ivd_status', 'ivd_sequence', 'equivalent_to'] : []), ...(image ? ['image_key', 'image_type', 'image_size'] : [])]
  const values: (string | number | null)[] = fields.map(name => row[name])
  if (meta) values.push(meta.radical, meta.encoded_as, meta.strokes, meta.ivd_status, meta.ivd_sequence, meta.equivalent_to)
  if (image) values.push(image.key, image.type, image.size)
  const comparisonJson = JSON.stringify(comparisons)
  const columnList = columns.join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  // Check revocation and expiry in the write itself so a stale read cannot authorize it.
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const result = await db.prepare(`INSERT INTO entries (${columnList}, comparisons, created_at, creator_id)
      SELECT ${placeholders}, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), person_id
      FROM contributor_sessions WHERE token_hash = ? AND revoked_at IS NULL
      AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND NOT EXISTS (SELECT 1 FROM revoked_session_families r WHERE r.family_hash = COALESCE(contributor_sessions.family_hash, contributor_sessions.token_hash)) RETURNING id`)
      .bind(...values, comparisonJson, await hashToken(token)).first<{ id: number }>()
    if (result) return { id: result.id }
  }

  const person = crypto.randomUUID()
  const newToken = hex(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await hashToken(newToken)
  const now = new Date()
  const expires = new Date(now.getTime() + lifetimeSeconds * 1000).toISOString()
  // D1 batch executes as a transaction; no bearer is returned until every write commits.
  const results = await db.batch([
    db.prepare('INSERT INTO persons (id, created_at) VALUES (?, ?)').bind(person, now.toISOString()),
    db.prepare('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(tokenHash, person, now.toISOString(), expires),
    db.prepare(`INSERT INTO entries (${columnList}, comparisons, created_at, creator_id) VALUES (${placeholders}, ?, ?, ?) RETURNING id`).bind(...values, comparisonJson, now.toISOString(), person),
  ])
  const id = (results[2].results[0] as { id: number } | undefined)?.id
  if (!id) throw new DefinitiveSaveFailure('Could not save evidence')
  return { id, token: newToken }
}

export const sessionCookieSettings = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: lifetimeSeconds }
