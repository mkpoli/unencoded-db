import { expect, test } from 'bun:test'
import { equivalentSpellings } from './ids-variants'

const described = new Map([['𡕤', '⿱𡗗夂'], ['𡗗', '⿱丷⿻二人'], ['夂', '⿱𠂊㇏'], ['好', '⿰女子'], ['看', '⿱手目'], ['手', '⿱㇒⿻二亅'], ['明', '⿰日月']])
const table = { described, encoded: new Map([...described].map(([char, ids]) => [ids, char])) }

test('a part is written out and a run of parts is folded in, both ways', () => {
  const written = equivalentSpellings('⿺⿱𡗗夂面', table), folded = equivalentSpellings('⿺𡕤面', table)
  expect(written[0]).toBe('⿺⿱𡗗夂面')
  expect(written).toContain('⿺𡕤面')
  expect(folded[0]).toBe('⿺𡕤面')
  expect(folded).toContain('⿺⿱𡗗夂面')
})

test('the one typed comes first, and a form with no other spelling is alone', () => {
  expect(equivalentSpellings(' ⿰ 木 木 ', table)[0]).toBe('⿰木木')
  expect(equivalentSpellings('木', table)).toEqual(['木'])
})

test('a part whose description has a stroke or an overlay is never written out', () => {
  for (const spelling of equivalentSpellings('⿰手木', table)) expect(spelling).not.toMatch(/[㇒⿻亅]/u)
  for (const spelling of equivalentSpellings('⿰𡗗木', table)) expect(spelling).not.toContain('⿻')
})

test('written-out and folded parts combine at any depth', () => {
  const found = equivalentSpellings('⿱好看', table)
  for (const spelling of ['⿱好看', '⿱⿰女子看', '⿱好⿱手目', '⿱⿰女子⿱手目']) expect(found).toContain(spelling)
  expect(equivalentSpellings('⿱⿰女子⿱手目', table)).toContain('⿱好看')
})

test('radical code points stay as typed', () => {
  const found = equivalentSpellings('⿰⺅好', table)
  expect(found).toContain('⿰⺅⿰女子')
  for (const spelling of found) expect(spelling).toContain('⺅')
})

test('the number of spellings is capped, even for a table that loops', () => {
  const many = new Map([['甲', '⿰甲甲']])
  const loop = { described: many, encoded: new Map([['⿰甲甲', '甲']]) }
  expect(equivalentSpellings('⿰甲甲', loop)).toHaveLength(16)
  const wide = { described: new Map([['甲', '⿰子子'], ['子', '⿰女女'], ['女', '⿰母母']]), encoded: new Map() }
  const found = equivalentSpellings('⿰甲⿰甲甲', wide, 5)
  expect(found).toHaveLength(5)
  expect(equivalentSpellings('⿰甲⿰甲甲', wide)).toHaveLength(16)
  expect(equivalentSpellings('⿰甲⿰甲甲', wide, 1)).toEqual(['⿰甲⿰甲甲'])
})

test('a part BabelStone spells with an IWDS mate still meets the typed spelling', () => {
  const table = { encoded: new Map([['⿱𡗗夊', '𡕤']]), described: new Map([['𡕤', '⿱𡗗夊']]) }
  expect(equivalentSpellings('⿺𡕤面', table)).toContain('⿺⿱𡗗夂面')
  expect(equivalentSpellings('⿺⿱𡗗夂面', table)).toContain('⿺𡕤面')
})
