import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseDescriptions } from './character-tables'
import { buildIndex, lookup, TIER_MAX } from './encoded-index'

const { described } = parseDescriptions(gunzipSync(readFileSync('node_modules/ids-input/data/babelstone-ids.tsv.gz')).toString())
const index = await buildIndex(described, work => setTimeout(work, 0))

test('an encoded character with the same description is found as the same', () => {
  const hits = lookup(index, '⿰亻木')
  expect(hits.find(hit => hit.char === '休')?.tier).toBe('same')
  expect(lookup(index, '⿰女子').find(hit => hit.char === '好')?.tier).toBe('same')
})

test('at most TIER_MAX of a tier are kept, best first, and unrelated text finds none', () => {
  const hits = lookup(index, '⿰亻木')
  for (const tier of ['same', 'unifiable', 'similar']) expect(hits.filter(hit => hit.tier === tier).length).toBeLessThanOrEqual(TIER_MAX)
  expect(lookup(index, '⿰𠆢𠆢').every(hit => hit.char !== '休')).toBe(true)
})
