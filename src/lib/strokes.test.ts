import { describe, expect, test } from 'bun:test'
import { estimateStrokes } from './strokes'

const counts = new Map([['木', 4], ['日', 4], ['本', 5], ['明', 8]])

describe('stroke estimate', () => {
  test('adds components and marks the sum approximate', () => {
    expect(estimateStrokes('⿰木木', counts)).toEqual({ strokes: 8, approximate: true })
    expect(estimateStrokes('⿰日木', counts)).toEqual({ strokes: 8, approximate: true })
  })

  test('uses a single character count exactly', () => {
    expect(estimateStrokes('本', counts)).toEqual({ strokes: 5, approximate: false })
  })

  test('returns null when a component has no count or the IDS is empty', () => {
    expect(estimateStrokes('⿰木？', counts)).toBeNull()
    expect(estimateStrokes('', counts)).toBeNull()
  })
})
