// The records the server names for a description being typed, tiered by all the descriptions each states.
import { keepBest, TIER_MAX, TIERS } from './encoded-index'
import { splitIds } from './ids'
import { looseTier, nearer, prepare, prepareLoose, tierOf, type Data, type Hit, type Tier } from './similar'

export { TIER_MAX, TIERS }
/** A record the server names: every description it states, and whether one is exactly the typed text. */
export type RecordCandidate = { id: number; ids: string | null; layout: string | null; cover_key: string | null; descriptions?: string[]; exact?: boolean; named?: boolean }
const NAMED = 0.5
export type RecordHit = { source: 'record'; tier: Tier; score: number; record: RecordCandidate }

/** An exact hit of the server is the same, even when the table of descriptions could not be loaded. A text that is no description finds the records that hold all its parts. */
export function tierRecords(ids: string, records: readonly RecordCandidate[], data: Data): RecordHit[] {
  const query = prepare(ids, data), loose = query ? null : prepareLoose(ids, data)
  if (!query && !loose) return []
  const found: RecordHit[] = []
  for (const record of records) {
    const descriptions = record.descriptions ?? splitIds(record.ids)
    let best: Hit | null = query ? tierOf(query, descriptions, data) : looseTier(loose!, descriptions, data)
    if (query && record.exact && !query.placeholder) best = nearer(best, { tier: 'same', score: 1 })
    // A record that names a character the typed parts make is worth a look, whatever its own description.
    if (!best && record.named) best = { tier: 'similar', score: NAMED }
    if (best) found.push({ source: 'record', ...best, record })
  }
  return keepBest(found)
}
