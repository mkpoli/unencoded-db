// The records the server names for a description being typed, tiered by all the descriptions each states.
import { keepBest, TIER_MAX, TIERS } from './encoded-index'
import { splitIds } from './ids'
import { nearer, prepare, tierOf, type Data, type Hit, type Tier } from './similar'

export { TIER_MAX, TIERS }
/** A record the server names: every description it states, and whether one is exactly the typed text. */
export type RecordCandidate = { id: number; ids: string | null; layout: string | null; cover_key: string | null; descriptions?: string[]; exact?: boolean }
export type RecordHit = { source: 'record'; tier: Tier; score: number; record: RecordCandidate }

/** An exact hit of the server is the same, even when the table of descriptions could not be loaded. */
export function tierRecords(ids: string, records: readonly RecordCandidate[], data: Data): RecordHit[] {
  const query = prepare(ids, data)
  if (!query) return []
  const found: RecordHit[] = []
  for (const record of records) {
    let best: Hit | null = tierOf(query, record.descriptions ?? splitIds(record.ids), data)
    if (record.exact && !query.placeholder) best = nearer(best, { tier: 'same', score: 1 })
    if (best) found.push({ source: 'record', ...best, record })
  }
  return keepBest(found)
}
