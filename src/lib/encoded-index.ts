// The encoded characters indexed by the parts of their expanded descriptions, and the lookup of those a
// description may duplicate. Pure, so tests and scripts run it on the real table.
import { prepare, tierOf, type Data, type Prepared, type Tier } from './similar'

export const TIER_MAX = 8
export const TIERS: readonly Tier[] = ['same', 'unifiable', 'similar']
/** Characters scored for one query at most. */
export const SCORED_MAX = 5000
const CHUNK = 500

export type Index = { data: Data; byKey: Map<string, string[]>; prepared: Map<string, Prepared> }
export type EncodedHit = { tier: Tier; score: number; char: string; ids: string }

const idle = (work: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(work) : setTimeout(work, 0)

/** Each character with a description, by every part (as its group) its expanded description holds, a chunk at a time while the page is idle. */
export function buildIndex(described: ReadonlyMap<string, string>, yielding: (work: () => void) => unknown = idle): Promise<Index> {
  return new Promise(resolve => {
    const data: Data = { described }
    const byKey = new Map<string, string[]>(), prepared = new Map<string, Prepared>()
    const entries = described.entries()
    const step = () => {
      for (let n = 0; n < CHUNK; n++) {
        const next = entries.next()
        if (next.done) return resolve({ data, byKey, prepared })
        const [char, ids] = next.value
        const made = prepare(ids, data)
        if (!made) continue
        prepared.set(char, made)
        for (const key of made.counts.keys()) { const list = byKey.get(key); if (list) list.push(char); else byKey.set(key, [char]) }
      }
      yielding(step)
    }
    yielding(step)
  })
}

export const keepBest = <T extends { tier: Tier; score: number }>(found: T[]) => TIERS.flatMap(tier => found.filter(item => item.tier === tier).sort((a, b) => b.score - a.score).slice(0, TIER_MAX))

/**
 * The characters whose descriptions are the same, unifiable or similar, the best `TIER_MAX` of each tier.
 * Only characters under the query's rarest part are scored, and when the query has two or more parts, only
 * those sharing two of them.
 */
export function lookup({ data, byKey, prepared }: Index, ids: string): EncodedHit[] {
  const query = prepare(ids, data)
  if (!query) return []
  const keys = [...query.counts.keys()]
  const rarest = keys.reduce((best, key) => (byKey.get(key)?.length ?? 0) < (byKey.get(best)?.length ?? 0) ? key : best)
  const found: EncodedHit[] = []
  let scored = 0
  for (const char of byKey.get(rarest) ?? []) {
    if (scored++ >= SCORED_MAX) break
    const own = prepared.get(char)!
    if (keys.length >= 2 && keys.filter(key => own.counts.has(key)).length < 2) continue
    const hit = tierOf(query, own, data)
    if (hit) found.push({ ...hit, char, ids: data.described.get(char)! })
  }
  return keepBest(found)
}
