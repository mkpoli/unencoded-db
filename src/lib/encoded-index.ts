// The encoded characters indexed by the parts of their expanded descriptions, and the lookup of those a
// description may duplicate. Every description of a character is indexed, as numbers in typed arrays: a
// description's text, its character and its postings are three arrays and a map, not an object each. Pure,
// so tests and scripts run it on the real table.
import type { Descriptions } from './character-tables'
import { forgetExpansions, nearer, plain, prepare, tierOf, type Data, type Hit, type Tier } from './similar'

export const TIER_MAX = 8
export const TIERS: readonly Tier[] = ['same', 'probable', 'similar']
/** Descriptions scored for one query at most, besides those with exactly its text. */
export const SCORED_MAX = 5000
const CHUNK = 500

export type Index = {
  data: Data
  /** Each description, by its number. */
  texts: string[]
  /** The code point of the character each description is of. */
  owner: Uint32Array
  /** The next description with the same text, or -1. */
  next: Int32Array
  /** A text to the first description that has it. */
  exact: Map<string, number>
  /** A part (as its group) to the descriptions that hold it once expanded. */
  byKey: Map<string, Uint32Array>
}
export type EncodedHit = Hit & { char: string; ids: string }

const idle = (work: () => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(work) : setTimeout(work, 0)

/** Every description of every character, by the parts it holds, a chunk at a time while the page is idle. */
export function buildIndex({ described, all }: Pick<Descriptions, 'described' | 'all'>, yielding: (work: () => void) => unknown = idle): Promise<Index> {
  return new Promise(resolve => {
    const data: Data = { described }
    let total = 0
    for (const list of all.values()) total += list.length
    const texts: string[] = [], owner = new Uint32Array(total), next = new Int32Array(total).fill(-1)
    const exact = new Map<string, number>(), lists = new Map<string, number[]>()
    const entries = all.entries()
    let pending: [string, string[]] | null = null, at = 0
    const step = () => {
      for (let n = 0; n < CHUNK; n++) {
        if (!pending) {
          const found = entries.next()
          if (found.done) {
            forgetExpansions()
            return resolve({ data, texts, owner, next, exact, byKey: new Map([...lists].map(([key, numbers]) => [key, Uint32Array.from(numbers)])) })
          }
          pending = [found.value[0], [...found.value[1]]]
        }
        const [char, list] = pending
        const text = list.shift()!
        if (!list.length) pending = null
        const number = at++
        texts.push(text)
        owner[number] = char.codePointAt(0)!
        const first = exact.get(text)
        if (first !== undefined) next[number] = first
        exact.set(text, number)
        const made = prepare(text, data)
        if (made) for (const key of made.counts.keys()) { const numbers = lists.get(key); if (numbers) numbers.push(number); else lists.set(key, [number]) }
      }
      yielding(step)
    }
    yielding(step)
  })
}

export const keepBest = <T extends { tier: Tier; score: number }>(found: T[]) => TIERS.flatMap(tier => found.filter(item => item.tier === tier).sort((a, b) => b.score - a.score).slice(0, TIER_MAX))

/**
 * The characters whose descriptions are the same, probable or similar, the best `TIER_MAX` of each tier. A
 * character with exactly the typed text is always found. Of the rest only descriptions under the query's
 * rarest part are scored, and when the query has two or more parts, only those sharing two of them.
 */
export function lookup(index: Index, ids: string): EncodedHit[] {
  const { data, texts, owner, next, exact, byKey } = index
  const query = prepare(ids, data)
  if (!query) return []
  const found = new Map<number, EncodedHit>()
  const consider = (number: number, prepared = prepare(texts[number], data)) => {
    const hit = tierOf(query, prepared ?? texts[number], data)
    if (!hit) return
    const point = owner[number], held = found.get(point)
    if (!held || nearer(hit, held) !== held) found.set(point, { ...hit, char: String.fromCodePoint(point), ids: texts[number] })
  }
  for (let number = exact.get(plain(ids)) ?? -1; number >= 0; number = next[number]) consider(number)
  const keys = [...query.counts.keys()]
  const rarest = keys.reduce((best, key) => (byKey.get(key)?.length ?? 0) < (byKey.get(best)?.length ?? 0) ? key : best)
  let scored = 0
  for (const number of byKey.get(rarest) ?? []) {
    if (scored++ >= SCORED_MAX) break
    const own = prepare(texts[number], data)
    if (!own || (keys.length >= 2 && keys.filter(key => own.counts.has(key)).length < 2)) continue
    consider(number, own)
  }
  forgetExpansions()
  return keepBest([...found.values()])
}
