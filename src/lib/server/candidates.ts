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

export type Candidate = { id: number; ids: string | null; layout: string | null; cover_key: string | null }

/**
 * The part rows to read: each distinct part of the query as written, then the parts its expansion has (the
 * caller knows the tables for that), then the parts IWDS lists as one with those, up to `SPELLINGS_MAX`.
 */
export function spellings(ids: string, expansion: readonly string[] = []) {
  const own = [...new Set([...partsOf(ids), ...expansion.map(radicalEquivalent)])]
  return [...new Set([...own, ...own.flatMap(groupMates)])].slice(0, SPELLINGS_MAX).map(part => `p:${part}`)
}

export const spellingStatement = (db: D1Database, tag: string) =>
  db.prepare('SELECT entry_id FROM entry_tags WHERE tag = ? ORDER BY entry_id LIMIT ?').bind(tag, PER_SPELLING)

export const loadStatement = (db: D1Database, ids: readonly number[]) =>
  db.prepare(`SELECT id, ids, layout, cover_key FROM entries WHERE id IN (${ids.map(() => '?').join(',')}) AND merged_into IS NULL AND hidden_at IS NULL`).bind(...ids)

/** Up to `CANDIDATES_MAX` visible records: those described by exactly this sequence, then those sharing the most distinct parts with it. */
export async function candidates(db: D1Database, ids: string, expansion: readonly string[] = []): Promise<Candidate[]> {
  const exact = await sameIds(db, ids, SAME_MAX)
  const tags = spellings(ids, expansion)
  const hits = new Map<number, number>()
  if (tags.length) {
    const read = await db.batch(tags.map(tag => spellingStatement(db, tag)))
    for (const { results } of read as { results: { entry_id: number }[] }[]) for (const { entry_id } of results) hits.set(entry_id, (hits.get(entry_id) ?? 0) + 1)
  }
  const exactIds = new Set(exact.map(record => record.id))
  const top = [...hits].filter(([id]) => !exactIds.has(id)).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, CANDIDATES_MAX - exact.length).map(([id]) => id)
  const rows = top.length ? (await loadStatement(db, top).all<Candidate>()).results : []
  const byId = new Map(rows.map(row => [row.id, row]))
  return [...exact, ...top.flatMap(id => byId.get(id) ?? [])]
}
