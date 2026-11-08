import { expect, test } from 'bun:test'
import { newComparison, removeComparison } from './comparison-rows'

test('new comparisons default to uncertain', () => {
  expect(newComparison().relationship).toBe('uncertain')
})

test('removing a row keeps errors aligned and updates the count', () => {
  const rows = Array.from({ length: 11 }, (_, i) => i)
  const errors = rows.map(i => `error ${i}`)
  const next = removeComparison(rows, errors, 1)
  expect(next.rows).toHaveLength(10)
  expect(next.rows[1]).toBe(2)
  expect(next.errors[1]).toBe('error 2')
})
