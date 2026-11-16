// Likely duplicates of a description being typed, from the encoded characters (indexed here the first time
// it is asked for) and from the records (`/api/candidates`, tiered here too).
import { describedTable } from './encoded'
import { buildIndex, keepBest, lookup, TIER_MAX, TIERS, type Index } from './encoded-index'
import { splitIds } from './ids'
import { expandedLeaves, prepare, tierOf, type Data, type Tier } from './similar'

export { TIER_MAX, TIERS }
export type RecordCandidate = { id: number; ids: string | null; layout: string | null; cover_key: string | null }
export type Found =
  | { source: 'record'; tier: Tier; score: number; record: RecordCandidate }
  | { source: 'encoded'; tier: Tier; score: number; char: string; ids: string }

let index: Promise<Index> | null = null
/** Starts building the index; call it early so a query finds it ready. */
export const warmIndex = () => index ??= describedTable().then(({ described }) => buildIndex(described))

/** The encoded characters whose descriptions are the same, unifiable or similar. */
export async function encodedCandidates(ids: string): Promise<Found[]> {
  return lookup(await warmIndex(), ids).map(hit => ({ source: 'encoded', ...hit }))
}

const order = (a: { tier: Tier; score: number }, b: { tier: Tier; score: number }) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.score - a.score

/** The records the server named, tiered by their descriptions. A record with several descriptions takes its best. */
export async function tierRecords(ids: string, records: readonly RecordCandidate[]): Promise<Found[]> {
  const data: Data = await describedTable()
  const query = prepare(ids, data)
  if (!query) return []
  const found: Found[] = []
  for (const record of records) {
    let best: ReturnType<typeof tierOf> = null
    for (const own of splitIds(record.ids)) { const hit = tierOf(query, own, data); if (hit && (!best || order(hit, best) < 0)) best = hit }
    if (best) found.push({ source: 'record', ...best, record })
  }
  return keepBest(found)
}

/** The parts of a description once expanded, for the server to read the records that hold them. */
export async function expandedParts(ids: string) {
  return expandedLeaves(ids, await describedTable())
}
