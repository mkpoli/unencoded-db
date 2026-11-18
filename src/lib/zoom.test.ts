import { expect, test } from 'bun:test'
import { aroundPoint, clampZoom, confinePan } from './zoom'

test('the scale stays between the fitted picture and the largest enlargement', () => {
  expect(clampZoom(0.5)).toBe(1)
  expect(clampZoom(1.5)).toBe(1.5)
  expect(clampZoom(20)).toBe(8)
})

test('a picture smaller than its frame stays centred', () => {
  expect(confinePan({ x: 30, y: -20 }, 1, { width: 200, height: 100 }, { width: 400, height: 300 })).toEqual({ x: 0, y: 0 })
})

test('a larger picture can move until an edge meets the frame', () => {
  expect(confinePan({ x: 300, y: -300 }, 2, { width: 200, height: 100 }, { width: 400, height: 150 })).toEqual({ x: 0, y: -25 })
  expect(confinePan({ x: 120, y: 20 }, 2, { width: 200, height: 100 }, { width: 400, height: 150 })).toEqual({ x: 0, y: 20 })
})

test('growing around a point keeps what lies under it still', () => {
  expect(aroundPoint({ x: 10, y: -4 }, { x: 40, y: 20 }, 1, 2)).toEqual({ x: -20, y: -28 })
})
