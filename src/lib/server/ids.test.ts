import { expect, test } from 'bun:test'
import { splitIds } from '$lib/ids'
import { idsInvalid, rawIds, readIds } from './ids'

test('keeps every submitted value for a form returned with errors', () => {
  const form = new FormData()
  for (let i = 0; i < 21; i++) form.append('ids', '⿰木' + '木'.repeat(i))
  expect(idsInvalid(form)).toBe(true)
  expect(rawIds(form)).toHaveLength(21)
  expect(splitIds(readIds(form)!)).toHaveLength(20)
})

test('reads descriptions separated by commas or whitespace', () => {
  const form = new FormData()
  form.set('ids', '⿰木木, ⿱木木，⿰水木\t⿰火火')
  expect(readIds(form)).toBe('⿰木木 ⿱木木 ⿰水木 ⿰火火')
  expect(idsInvalid(form)).toBe(false)
})

test('keeps the comma-separated field unchanged when the form is returned with errors', () => {
  const field = Array.from({ length: 21 }, (_, i) => '⿰木' + '木'.repeat(i)).join(', ')
  const form = new FormData()
  form.set('ids', field)
  expect(rawIds(form)).toEqual([field])
})
