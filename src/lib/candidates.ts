// Likely duplicates of a description being typed, from the encoded characters (indexed here the first time
// a query asks, once per page) and from the records (`/api/candidates`, tiered here too).
import { describedTable } from './encoded'
import { buildIndex, keepBest, lookup, TIER_MAX, TIERS, type Index } from './encoded-index'
import { splitIds } from './ids'
import { retrying } from './retrying'
import { tierRecords as tiered, type RecordCandidate } from './record-tiers'
import { expandedLeaves, looseLeaves, type Data, type Tier } from './similar'

export { TIER_MAX, TIERS, type RecordCandidate }
export type Found =
  | { source: 'record'; tier: Tier; score: number; record: RecordCandidate }
  | { source: 'encoded'; tier: Tier; score: number; char: string; ids: string }

const index = retrying<Index>(() => describedTable().then(buildIndex))
/** The encoded characters whose descriptions are the same, probable or similar. A failed table load is tried again by the next query. */
export async function encodedCandidates(ids: string): Promise<Found[]> {
  return lookup(await index(), ids).map(hit => ({ source: 'encoded', ...hit }))
}

// Without the table a record is still tiered by its own text, radicals and groups.
const without: Data = { described: new Map() }
const table = (): Promise<Data> => describedTable().catch(() => without)

/** The records the server named, tiered by all their descriptions; without the table, by their text, radicals and groups. */
export async function tierRecords(ids: string, records: readonly RecordCandidate[]): Promise<Found[]> {
  return tiered(ids, records, await table())
}

/** The parts of a description, or of a text that is not one yet, once expanded, for the server to read the records that hold them; none without the table. */
export async function expandedParts(ids: string) {
  const data = await table(), leaves = expandedLeaves(ids, data)
  return leaves.length || data === without ? leaves : looseLeaves(ids, data)
}
