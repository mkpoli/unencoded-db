import { expect, test } from 'bun:test'
import { codePointCharacters, encodedCharacter } from './ids'

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
