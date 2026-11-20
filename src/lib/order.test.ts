import { expect, test } from 'bun:test'
import { pageSteps } from './order'

test('a pager offers the first page, the last and those beside the open ones', () => {
  expect(pageSteps(1, 1, 1)).toEqual([1])
  expect(pageSteps(1, 1, 5)).toEqual([1, 2, 3, null, 5])
  expect(pageSteps(20, 20, 40)).toEqual([1, null, 18, 19, 20, 21, 22, null, 40])
  expect(pageSteps(20, 22, 40)).toEqual([1, null, 18, 19, 20, 21, 22, 23, 24, null, 40])
  expect(pageSteps(40, 40, 40)).toEqual([1, null, 38, 39, 40])
  expect(pageSteps(3, 3, 6)).toEqual([1, 2, 3, 4, 5, 6])
})
