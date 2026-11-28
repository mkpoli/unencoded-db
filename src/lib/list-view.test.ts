import { expect, test } from 'bun:test'
import { listViewOf } from './list-view'
import { pageSizeOf } from './order'
import { pageColumns } from './tile-size'

test('a list is shown whole unless the reader chose pages', () => {
  expect([undefined, null, '', 'all', 'paged', 'pages'].map(listViewOf)).toEqual(['all', 'all', 'all', 'all', 'paged', 'all'])
})

test('a page can hold 16 by 16 records, laid out 16 to a row when they fit', () => {
  expect(pageSizeOf('256')).toBe(256)
  expect(pageColumns(16 * 64 + 15 * 8, 64, 8, 256)).toBe(16)
})
