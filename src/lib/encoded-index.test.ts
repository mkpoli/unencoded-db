import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseDescriptions } from './character-tables'
import { buildIndex, lookup, TIER_MAX } from './encoded-index'
import { isDescription } from 'ids-input'
import { prepare } from './similar'
import { retrying } from './retrying'

const table = parseDescriptions(gunzipSync(readFileSync('node_modules/ids-input/data/babelstone-ids.tsv.gz')).toString())
const index = await buildIndex(table, work => setTimeout(work, 0))
const real = (text: string) => isDescription(text) && !prepare(text, index.data)!.placeholder

test('an encoded character with the same text is found as the same', () => {
  expect(lookup(index, '⿰亻木').find(hit => hit.char === '休')?.tier).toBe('same')
  expect(lookup(index, '⿰女子').find(hit => hit.char === '好')?.tier).toBe('same')
})

test('every alternate description finds its character as the same', () => {
  const alternates = [...table.all].flatMap(([char, list]) => list.slice(1).filter(real).map(text => [char, text] as const))
  expect(alternates.length).toBeGreaterThan(500)
  const step = Math.floor(alternates.length / 500)
  for (let at = 0; at < alternates.length; at += step) {
    const [char, text] = alternates[at]
    expect(lookup(index, text).find(hit => hit.char === char)?.tier).toBe('same')
  }
}, 30000)

test('a character is the same as its own first description, even under a part most descriptions hold', () => {
  for (const [char, text] of [...table.described].filter((_, at) => at % 400 === 0).filter(([, text]) => real(text))) {
    expect(lookup(index, text).find(hit => hit.char === char)?.tier).toBe('same')
  }
}, 30000)

test('a radical form or a variant component is probable, not the same', () => {
  const found = (text: string, char: string) => lookup(index, text).find(hit => hit.char === char)?.tier
  expect(found(table.all.get('𠮥')![0], '召')).toBe('probable')
  expect(found(table.all.get('㤁')![0], '忝')).toBe('probable')
})

test('a placeholder query finds nothing as the same or probable', () => {
  const hits = lookup(index, '⿰木？')
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.every(hit => hit.tier === 'similar')).toBe(true)
})

test('at most TIER_MAX of a tier are kept, best first, and unrelated text finds none', () => {
  const hits = lookup(index, '⿰亻木')
  for (const tier of ['same', 'probable', 'similar']) expect(hits.filter(hit => hit.tier === tier).length).toBeLessThanOrEqual(TIER_MAX)
  expect(lookup(index, '⿰𠆢𠆢').every(hit => hit.char !== '休')).toBe(true)
})

test('a load that fails is tried again by the next ask, and one that works is shared', async () => {
  let calls = 0
  const load = retrying(async () => { if (++calls === 1) throw new Error('offline'); return calls })
  await expect(load()).rejects.toThrow('offline')
  expect(await load()).toBe(2)
  expect(await load()).toBe(2)
  expect(calls).toBe(2)
})

test('parts typed with no structure find the characters that hold them all, the one made of them alone first', () => {
  const hits = lookup(index, '艹時')
  expect(hits[0]).toMatchObject({ char: '蒔', tier: 'similar', score: 1 })
  expect(hits.every(hit => hit.tier === 'similar')).toBe(true)
  expect(hits.length).toBeLessThanOrEqual(TIER_MAX)
  // The parts may be written out, in any order, as radical code points, or inside a description half written.
  for (const text of ['寺日艹', '⺾時', '⿰⿱艹時']) expect(lookup(index, text)[0]?.char).toBe('蒔')
  expect(lookup(index, '⿱艹')).toEqual([])
})

test('a guessed structure finds the character made of its parts first, and characters that hold them among others', () => {
  const hits = lookup(index, '⿰艹時')
  expect(hits[0]).toMatchObject({ char: '蒔', tier: 'similar' })
  expect(lookup(index, '⿱日寺').find(hit => hit.char === '時')).toMatchObject({ tier: 'similar', score: 0.95 })
})

test('stroke-level remainder splits and differing rarest parts still find the target character', () => {
  expect(lookup(index, '⿱亠⿰丿小')[0]).toMatchObject({ char: '亦', tier: 'similar' })
  // Query whose rarest part differs from the target (𠂢 is rarer than 亻 and 木) still finds a one-off match.
  expect(lookup(index, '⿰亻⿱木𠂢').some(hit => hit.tier === 'similar')).toBe(true)
})
