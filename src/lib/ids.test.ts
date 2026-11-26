import { expect, test } from 'bun:test'
import { canonicalizeIds, cleanIds, codePointCharacters, encodedCharacter, idsSpellingVariants, splitIds } from './ids'

test('a Unicode code names its character', () => {
  expect(encodedCharacter('U+5D20')).toBe('崠')
  expect(encodedCharacter('u+2d6dd (Ext. J)')).toBe('\u{2D6DD}')
  expect(encodedCharacter('U+D800')).toBe('')
  expect(encodedCharacter('1-23-45')).toBe('')
})

test('a text of Unicode codes names its characters', () => {
  expect(codePointCharacters('U+9050')).toBe('遐')
  expect(codePointCharacters('u+0041 U+0042')).toBe('AB')
  expect(codePointCharacters('U+4E00 U+E0100')).toBe('\u4E00\u{E0100}')
  expect(codePointCharacters('遐')).toBe('')
  expect(codePointCharacters('U+9050 遐')).toBe('')
  expect(codePointCharacters('U+D800')).toBe('')
  expect(codePointCharacters('U+110000')).toBe('')
})

test('headless 鬼 normalises to ⿷⿱田儿厶 and both spellings resolve to each other', () => {
  expect(canonicalizeIds('⿱田⿺儿厶')).toBe('⿷⿱田儿厶')
  expect(cleanIds('⿰云⿱田⿺儿厶')).toBe('⿰云⿷⿱田儿厶')
  expect(cleanIds('⿰云⿱⽥⿺⼉⼛')).toBe('⿰云⿷⿱田儿厶')
  expect(cleanIds('⿷⿱田儿厶')).toBe('⿷⿱田儿厶')
  expect(splitIds('⿰云⿱田⿺儿厶 ⿰云⿷⿱田儿厶')).toEqual(['⿰云⿷⿱田儿厶'])
  expect(idsSpellingVariants('⿰云⿱田⿺儿厶')).toEqual(['⿰云⿷⿱田儿厶', '⿰云⿱田⿺儿厶'])
  expect(idsSpellingVariants('⿰云⿷⿱田儿厶')).toEqual(['⿰云⿷⿱田儿厶', '⿰云⿱田⿺儿厶'])
  expect(idsSpellingVariants('⿰木木')).toEqual(['⿰木木'])
})
