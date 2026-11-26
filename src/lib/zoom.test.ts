import { expect, test } from 'bun:test'
import { aroundPoint, clampZoom, confinePan, focusBox, maxZoomFor } from './zoom'

test('the scale stays between the fitted picture and the largest enlargement', () => {
  expect(clampZoom(0.5)).toBe(1)
  expect(clampZoom(1.5)).toBe(1.5)
  expect(clampZoom(20)).toBe(8)
  expect(clampZoom(14, 16)).toBe(14)
  expect(clampZoom(20, 16)).toBe(16)
})

test('high-resolution wide or tall scans can enlarge past the default ceiling', () => {
  expect(maxZoomFor({ width: 800, height: 600 }, { width: 800, height: 600 })).toBe(8)
  expect(maxZoomFor({ width: 3200, height: 640 }, { width: 800, height: 160 })).toBe(16)
  expect(maxZoomFor({ width: 500, height: 3200 }, { width: 50, height: 320 })).toBe(32)
  expect(maxZoomFor({ width: 0, height: 0 }, { width: 200, height: 100 })).toBe(8)
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

test('focusing a marked box zooms in and brings it into the middle of the frame', () => {
  const result = focusBox([700, 700, 100, 100], { width: 1000, height: 1000 }, { width: 400, height: 400 }, { width: 400, height: 400 }, 16)
  expect(result.zoom).toBe(2.5)
  expect(result.pan).toEqual({ x: -250, y: -250 })
})

test('focusing a box on a wide scan expands into the full frame height', () => {
  const result = focusBox([2400, 300, 120, 120], { width: 3200, height: 640 }, { width: 1000, height: 200 }, { width: 1000, height: 700 }, 16)
  expect(result.zoom).toBeGreaterThan(4)
  expect(result.pan.x).toBeLessThan(0)
})
