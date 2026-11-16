import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { parseDescriptions } from './character-tables'
import { expandedLeaves, groupMates, normalise, tierOf } from './similar'

const data = { described: new Map([['好', '⿰女子'], ['看', '⿱手目'], ['手', '⿱㇒⿻二亅'], ['明', '⿰日月'], ['朙', '⿰囧月'], ['循', '⿰彳盾'], ['環', '⿰玉睘']]) }
const tier = (q: string, c: string) => tierOf(q, c, data)

test('radical code points and spaces are normalised', () => {
  expect(normalise('⿰ ⺅ 木', { described: new Map() })).toBe('⿰亻木')
  expect(normalise('⿰⼈木', { described: new Map() })).toBe('⿰人木')
  expect(tier('⿰⺅木', '⿰亻木')?.tier).toBe('same')
})

test('a part with a description is expanded until none is', () => {
  expect(normalise('⿱好看', data)).toBe('⿱⿰女子⿱手目')
  expect(expandedLeaves('⿱好看', data)).toEqual(['女', '子', '手', '目'])
  expect(tier('⿱好看', '⿱⿰女子看')).toEqual({ tier: 'same', score: 1 })
})

test('a description that names its own part stops at the depth cap', () => {
  const loop = { described: new Map([['甲', '⿰甲丙']]) }
  expect(expandedLeaves('⿰甲木', loop)).toHaveLength(5)
})

test('parts IWDS lists as one make a description unifiable', () => {
  expect(groupMates('王')).toContain('壬')
  expect(tier('⿰王木', '⿰壬木')).toEqual({ tier: 'unifiable', score: 1 })
  expect(tier('⿰王木', '⿰王木')?.tier).toBe('same')
})

test('one part different, or the same parts reordered, is similar', () => {
  expect(tier('⿰亻木', '⿰亻水')).toEqual({ tier: 'similar', score: 0.9 })
  expect(tier('⿰亻木', '⿰木亻')).toEqual({ tier: 'similar', score: 0.9 })
  expect(tier('⿰亻木', '⿱亻木')).toEqual({ tier: 'similar', score: 0.9 })
})

test('mostly the same parts is similar by overlap, with the overlap as its score', () => {
  const found = tier('⿱⿰木木⿰火火', '⿱⿰木木⿰火土')
  expect(found?.tier).toBe('similar')
  const overlap = tier('⿰⿰亻木⿰水火', '⿰⿰亻木⿱水土')
  expect(overlap?.tier).toBe('similar')
  expect(overlap!.score).toBeCloseTo(0.6)
})

test('unrelated descriptions are none', () => {
  expect(tier('⿰亻木', '⿱山水')).toBeNull()
  expect(tier('⿰亻木', '木')).toBeNull()
  expect(tier('⿰亻', 'x')).toBeNull()
})

test('the real BabelStone table expands whole components and stops at strokes', () => {
  const real = parseDescriptions(gunzipSync(readFileSync('node_modules/ids-input/data/babelstone-ids.tsv.gz')).toString())
  expect(tierOf('⿱好看', '⿱⿰女子看', real)?.tier).toBe('same')
  expect(expandedLeaves('⿰亻木', real)).toEqual(['亻', '木'])
  expect(expandedLeaves('⿱好看', real).slice(0, 2)).toEqual(['女', '子'])
})
