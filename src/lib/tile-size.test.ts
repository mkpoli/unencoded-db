import { expect, test } from 'bun:test'
import { pageColumns } from './tile-size'

test('a paged grid takes the most columns that fit and divide a page', () => {
  expect(pageColumns(1184, 145, 16, 48)).toBe(6)
  expect(pageColumns(1184, 120, 16, 48)).toBe(8)
  expect(pageColumns(358, 145, 16, 48)).toBe(2)
  expect(pageColumns(100, 300, 16, 48)).toBe(1)
  expect(pageColumns(1184, 48, 8, 48)).toBe(16)
  for (let width = 200; width < 2600; width += 37) for (const tile of [48, 64, 80, 96, 120, 145, 180, 230, 300]) expect(48 % pageColumns(width, tile, 16, 48)).toBe(0)
})
