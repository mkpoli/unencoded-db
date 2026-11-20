import { expect, test } from 'bun:test'
import { equivalentSpellings, isParts, partSpellings, spellingGroups } from './ids-variants'

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

test('without mates, only spellings of the very same form are given', () => {
  const table = { encoded: new Map([['⿱𡗗夂', '𡕤']]), described: new Map([['𡕤', '⿱𡗗夂']]) }
  expect(equivalentSpellings('⿺⿱𡗗夂面', table, 16, false)).toEqual(['⿺⿱𡗗夂面', '⿺𡕤面'])
})

test('a run folds into a character described with an IWDS-equivalent part, even without mates', () => {
  const table = { encoded: new Map([['⿱𡗗夊', '𡕤']]), described: new Map([['𡕤', '⿱𡗗夊']]) }
  const found = equivalentSpellings('⿺⿱𡗗夂面', table, 16, false)
  expect(found.slice(0, 2)).toEqual(['⿺⿱𡗗夂面', '⿺𡕤面'])
  for (const spelling of found) expect(spelling).not.toMatch(/[攵文攴]/u)
})

test('descriptions of one form group, and the first in the group draws', () => {
  const table = { encoded: new Map([['⿱𡗗夂', '𡕤']]), described: new Map([['𡕤', '⿱𡗗夂']]) }
  const groups = spellingGroups([{ ids: '⿺⿱𡗗夂面', place: 1 }, { ids: '⿰木木', place: 2 }, { ids: '⿺𡕤面', place: 3 }], table)
  expect(groups.map(group => group.map(form => form.place))).toEqual([[1, 3], [2]])
  expect(spellingGroups([{ ids: '⿰木木' }], table)).toEqual([[{ ids: '⿰木木' }]])
})

test('parts typed with no structure are also the parts written out and the character they make', () => {
  const parts = new Map([['蒔', '⿱艹時'], ['時', '⿰日寺'], ['寺', '⿱土寸']])
  const known = { described: parts, encoded: new Map([...parts].map(([char, ids]) => [ids, char])) }
  expect(partSpellings('艹時', known)).toEqual(['艹時', '艹日寺', '蒔', '艹日土寸'])
  // Either order of two parts makes the character, and a radical code point is the ideograph it stands for.
  expect(partSpellings('寺日', known)).toContain('時')
  expect(partSpellings('⺾時', known)[0]).toBe('艹時')
  expect(partSpellings('艹時', known, 2)).toHaveLength(2)
  expect(partSpellings('木', known)).toEqual(['木'])
  expect(isParts('艹時')).toBe(true)
  for (const text of ['⿱艹時', '艹 時', 'word', '']) expect(isParts(text)).toBe(false)
})
