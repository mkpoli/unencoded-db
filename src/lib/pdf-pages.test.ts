import { expect, test } from 'bun:test'
import { pagesOf } from './pdf-pages'

test('pages are read from single numbers and ranges', () => {
  expect(pagesOf('3', 5)).toEqual([3])
  expect(pagesOf('2-4', 5)).toEqual([2, 3, 4])
  expect(pagesOf('1, 4-5 2', 5)).toEqual([1, 4, 5, 2])
  expect(pagesOf('2–3、3', 5)).toEqual([2, 3])
})

test('a page outside the file, a reversed range and other text name nothing', () => {
  for (const text of ['', '0', '6', '4-2', '2-9', 'two', '1-', '-3']) expect(pagesOf(text, 5)).toBeNull()
})
