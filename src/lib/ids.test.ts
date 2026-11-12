import { expect, test } from 'bun:test'
import { encodedCharacter } from './ids'

test('a Unicode code names its character', () => {
  expect(encodedCharacter('U+5D20')).toBe('崠')
  expect(encodedCharacter('u+2d6dd (Ext. J)')).toBe('\u{2D6DD}')
  expect(encodedCharacter('U+D800')).toBe('')
  expect(encodedCharacter('1-23-45')).toBe('')
})
