import { expect, test } from 'bun:test'
import { formatIds, splitIds } from './ids'

test('splits descriptions on commas or any whitespace and removes duplicates', () => {
  expect(splitIds('⿰木木, ⿱木木\t⿰水木\n⿰木木')).toEqual(['⿰木木', '⿱木木', '⿰水木'])
})

test('shows descriptions separated by commas', () => {
  expect(formatIds('⿰木木 ⿱木木')).toBe('⿰木木, ⿱木木')
})
