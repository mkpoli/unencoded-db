import { expect, test } from 'bun:test'
import { splitIds } from './ids'

test('splits descriptions on any whitespace and removes duplicates', () => {
  expect(splitIds('⿰木木\t⿱木木\n⿰水木  ⿰木木')).toEqual(['⿰木木', '⿱木木', '⿰水木'])
})
