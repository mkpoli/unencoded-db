import { expect, test } from 'bun:test'
import { composerDrawing } from './composer'
import { glyphAddress } from './glyph-address'

test('the address names the description and the drawing version', () => {
  expect(glyphAddress('⿰山東', null, 'sans')).toBe(`/api/glyph?ids=${encodeURIComponent('⿰山東')}&v=${encodeURIComponent(composerDrawing('sans'))}`)
})

test('a style other than the default is named', () => {
  expect(glyphAddress('⿰山東', null, 'serif')).toBe(`/api/glyph?ids=${encodeURIComponent('⿰山東')}&v=${encodeURIComponent(composerDrawing('serif'))}&style=serif`)
})

test('a layout joins the address under the adjusted version', () => {
  const layout = JSON.stringify({ '0': [1, 0, 0, 0.5, 0, 0] })
  const address = glyphAddress('⿰山東', layout, 'sans')
  expect(address).toContain('&layout=')
  expect(address).toContain(`&v=${encodeURIComponent(composerDrawing('sans', true))}`)
})

test('no description, no address', () => {
  expect(glyphAddress('', null, 'sans')).toBe('')
})
