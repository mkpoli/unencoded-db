import { expect, test } from 'bun:test'
import { equivalentSpellings } from './ids-variants'

const described = new Map([['𡕤', '⿱𡗗夂'], ['𡗗', '⿱丷⿻二人'], ['夂', '⿱𠂊㇏'], ['好', '⿰女子'], ['看', '⿱手目'], ['手', '⿱㇒⿻二亅'], ['明', '⿰日月']])
const table = { described, encoded: new Map([...described].map(([char, ids]) => [ids, char])) }

test('a part is written out and a run of parts is folded in, both ways', () => {
  expect(equivalentSpellings('⿺⿱𡗗夂面', table)).toEqual(['⿺⿱𡗗夂面', '⿺𡕤面'])
  expect(equivalentSpellings('⿺𡕤面', table)).toEqual(['⿺𡕤面', '⿺⿱𡗗夂面'])
})

test('the one typed comes first, and a form with no other spelling is alone', () => {
  expect(equivalentSpellings(' ⿰ 木 木 ', table)).toEqual(['⿰木木'])
  expect(equivalentSpellings('木', table)).toEqual(['木'])
})

test('a part whose description has a stroke or an overlay is never written out', () => {
  expect(equivalentSpellings('⿰手木', table)).toEqual(['⿰手木'])
  expect(equivalentSpellings('⿰𡗗木', table)).toEqual(['⿰𡗗木'])
})

test('written-out and folded parts combine at any depth', () => {
  expect(equivalentSpellings('⿱好看', table)).toEqual(['⿱好看', '⿱⿰女子看', '⿱好⿱手目', '⿱⿰女子⿱手目'])
  expect(equivalentSpellings('⿱⿰女子⿱手目', table)).toContain('⿱好看')
})

test('radical code points stay as typed', () => {
  expect(equivalentSpellings('⿰⺅好', table)).toEqual(['⿰⺅好', '⿰⺅⿰女子'])
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
