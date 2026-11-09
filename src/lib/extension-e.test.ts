import { describe, expect, test } from 'bun:test'
import { EXTENSION_E_WITHDRAWN, EXTENSION_E_WRONG_GLYPH } from './extension-e'

describe('Extension E inventory', () => {
  test('lists the 134 withdrawn proposals once', () => {
    expect(EXTENSION_E_WITHDRAWN).toHaveLength(134)
    expect(new Set(EXTENSION_E_WITHDRAWN).size).toBe(134)
    expect(EXTENSION_E_WRONG_GLYPH.size).toBe(2)
    for (const id of EXTENSION_E_WRONG_GLYPH) expect(EXTENSION_E_WITHDRAWN).toContain(id)
  })
})
