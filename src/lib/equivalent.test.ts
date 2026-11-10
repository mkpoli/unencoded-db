import { describe, expect, test } from 'bun:test'
import { readEquivalentTo } from './equivalent'

describe('equivalent character', () => {
  test('accepts one character and keeps variation selectors attached', () => {
    expect(readEquivalentTo(' 漢 ')).toEqual({ value: '漢', valid: true })
    expect(readEquivalentTo('木\uFE00')).toEqual({ value: '木\uFE00', valid: true })
  })

  test('accepts an empty field', () => {
    expect(readEquivalentTo('')).toEqual({ value: null, valid: true })
    expect(readEquivalentTo(null)).toEqual({ value: null, valid: true })
  })

  test('rejects more than one character', () => {
    expect(readEquivalentTo('漢字')).toEqual({ value: '漢字', valid: false })
  })

  test('rejects a mark, selector or invisible control on its own', () => {
    for (const value of ['\uFE00', '\u0301', '\u200B', '\u{E0100}']) {
      expect(readEquivalentTo(value)).toEqual({ value, valid: false })
    }
  })

  test('normalizes the text before checking it', () => {
    expect(readEquivalentTo('か\u3099')).toEqual({ value: 'が', valid: true })
  })
})
