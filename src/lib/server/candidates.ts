// Records that may describe the same character as a description being typed, found through the part rows of
// `entry_tags`: a `p:<part>` row for each distinct part of each description a record states. The client tiers
// what comes back.
import { groupMates } from '$lib/similar'
import { radicalEquivalent } from '$lib/radicals'
import { partsOf, sameIds } from './entries'

export const CANDIDATES_MAX = 40
export const SPELLINGS_MAX = 12
export const PER_SPELLING = 200
export const SAME_MAX = 6

/** `descriptions` are every `ids` claim of the record, and `exact` says one is the typed text. */
export type Candidate = { id: number; ids: string | null; layout: string | null; cover_key: string | null; descriptions: string[]; exact: boolean }

/**
 * The part rows to read: each distinct part of the query as written, then the parts its expansion has (the
 * caller knows the tables for that), then the parts IWDS lists as one with those, up to `SPELLINGS_MAX`.
 */
export function spellings(ids: string, expansion: readonly string[] = []) {
  const own = [...new Set([...partsOf(ids), ...expansion.map(radicalEquivalent)])]
  return [...new Set([...own, ...own.flatMap(groupMates)])].slice(0, SPELLINGS_MAX).map(part => `p:${part}`)
}

export const spellingStatement = (db: D1Database, tag: string) =>
  db.prepare('SELECT entry_id FROM entry_tags WHERE tag = ? ORDER BY entry_id DESC LIMIT ?').bind(tag, PER_SPELLING)

/** The descriptions of these records, in the order they state them. */
export const descriptionsStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT entry_id, value FROM claims WHERE entry_id IN (${ids.map(() => '?').join(',')}) AND +kind = 'ids' ORDER BY entry_id, position`).bind(...ids)

export const loadStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT id, ids, layout, cover_key FROM entries WHERE id IN (${ids.map(() => '?').join(',')}) AND merged_into IS NULL AND hidden_at IS NULL`).bind(...ids)

/** Up to `CANDIDATES_MAX` visible records, never `exclude` (the record being edited): those described by exactly this sequence, then those sharing the most distinct parts with it, newest first among equals. */
export async function candidates(db: D1Database, ids: string, expansion: readonly string[] = [], exclude: number | null = null): Promise<Candidate[]> {
  const exact = (await sameIds(db, ids, SAME_MAX + 1)).filter(record => record.id !== exclude).slice(0, SAME_MAX)
  const tags = spellings(ids, expansion)
  const hits = new Map<number, number>()
  if (tags.length) {
    const read = await db.batch(tags.map(tag => spellingStatement(db, tag)))
    for (const { results } of read as { results: { entry_id: number }[] }[]) for (const { entry_id } of results) hits.set(entry_id, (hits.get(entry_id) ?? 0) + 1)
    if (exclude !== null) hits.delete(exclude)
  }
  const exactIds = new Set(exact.map(record => record.id))
  const top = [...hits].filter(([id]) => !exactIds.has(id)).sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, CANDIDATES_MAX - exact.length).map(([id]) => id)
  const rows = top.length ? (await loadStatement(db, top).all<Omit<Candidate, 'descriptions' | 'exact'>>()).results : []
  const byId = new Map(rows.map(row => [row.id, row]))
  const records = [...exact.map(record => ({ ...record, exact: true })), ...top.flatMap(id => byId.get(id) ?? []).map(record => ({ ...record, exact: false }))]
  if (!records.length) return []
  const held = new Map<number, string[]>()
  for (const { entry_id, value } of (await descriptionsStatement(db, records.map(record => record.id)).all<{ entry_id: number; value: string }>()).results) held.set(entry_id, [...(held.get(entry_id) ?? []), value])
  return records.map(record => ({ ...record, descriptions: held.get(record.id) ?? [] }))
}
