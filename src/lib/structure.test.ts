import { expect, test } from 'bun:test'
import { PATTERN_KEYS_MAX, STRUCTURE_KEYS_MAX, partRowsOf, structureKeys, structurePattern } from './structure'

test('a description is filed under each structure it holds, whole and with parts left open', () => {
  expect(structureKeys('⿲㇇丨𰛅')).toEqual(['⿲', '⿲㇇丨𰛅', '⿲？丨𰛅', '⿲㇇？𰛅', '⿲？？𰛅', '⿲㇇丨？', '⿲？丨？', '⿲㇇？？'])
  expect(structureKeys('⿰氵⿱艹木')).toEqual(['⿰', '⿰氵⿱艹木', '⿰？⿱艹木', '⿰氵？', '⿱', '⿱艹木', '⿱？木', '⿱艹？'])
  // A radical code point is the ideograph it stands for, and overlaid parts are filed in either order.
  expect(structureKeys('⿰⺡五')).toContain('⿰氵五')
  expect(structureKeys('⿻十八')).toEqual(expect.arrayContaining(['⿻十八', '⿻八十', '⿻？十']))
  // A part that is unknown is filed as one left open, and never as a structure with every part open.
  expect(structureKeys('⿰氵？')).toEqual(['⿰', '⿰氵？'])
  expect(structureKeys('水')).toEqual([])
  expect(structureKeys('⿰氵')).toEqual(['⿰'])
  expect(structureKeys('⿰'.repeat(90) + '一'.repeat(91)).length).toBe(STRUCTURE_KEYS_MAX)
  expect(partRowsOf('⿰⺡五')).toEqual(['p:氵', 'p:五', 'p:⿰', 'p:⿰氵五', 'p:⿰？五', 'p:⿰氵？'])
})

test('a structure typed to search with is read into the keys a record must hold', () => {
  expect(structurePattern('⿲')).toEqual(['⿲'])
  expect(structurePattern('⿰氵')).toEqual(['⿰氵？'])
  expect(structurePattern('⿰?木')).toEqual(['⿰？木'])
  expect(structurePattern('⿰*木')).toEqual(['⿰？木'])
  expect(structurePattern('⿰⬚木')).toEqual(['⿰？木'])
  expect(structurePattern('⿰氵⿱⬚木')).toEqual(['⿰氵？', '⿱？木'])
  expect(structurePattern('⿰ ⺡ 五')).toEqual(['⿰氵五'])
  // Operators are named in capitals; a word in small letters stays a word.
  expect(structurePattern('LR氵五')).toEqual(['⿰氵五'])
  expect(structurePattern('UD')).toEqual(['⿱'])
  expect(structurePattern('or')).toBeNull()
  expect(structurePattern('水')).toBeNull()
  expect(structurePattern('⿰氵五木')).toBeNull()
  expect(structurePattern('⿰？'.repeat(PATTERN_KEYS_MAX) + '⿰？一一')).toBeNull()
})

test('every key a structure is searched by is one its descriptions are filed under', () => {
  for (const [ids, pattern] of [['⿰氵⿱艹木', '⿰氵⿱？木'], ['⿰氵⿱艹木', '⿱艹'], ['⿻十八', '⿻八十'], ['⿲㇇丨𰛅', '⿲？丨'], ['⿱⿰木木⿰木木', '⿱⿰？木⿰木？']]) {
    expect(structureKeys(ids)).toEqual(expect.arrayContaining(structurePattern(pattern)!))
  }
})
