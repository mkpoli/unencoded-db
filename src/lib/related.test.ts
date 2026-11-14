import { expect, test } from 'bun:test'
import { encodedCharacter } from './related'

test('an encoded character is one code point of the standard, assigned or not to the runtime', () => {
  for (const value of ['哦', '一', 'a', '𲎿', '\u{2D6DD}']) expect(encodedCharacter(value)).toBe(true)
})

test('anything else is not an encoded character', () => {
  for (const value of ['', '哦哦', '⿰乂也', '⿰', '㇯', '', '\u{F0000}', '\u{10FFFD}', '山東']) expect(encodedCharacter(value)).toBe(false)
})

test('the value is read in NFC', () => {
  expect(encodedCharacter('é')).toBe(true)
  expect(encodedCharacter('áb')).toBe(false)
})
