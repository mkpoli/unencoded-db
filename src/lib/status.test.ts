import { expect, test } from 'bun:test'
import type { Claim } from './claims'
import { statusOf } from './status'

const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null): Claim => ({ key: 'aaaaaaaa', kind, value, data, sightings: [], under: [] })
const relation = (value: string, relationship: string) => claim('relation', value, { relationship })
const unicode = claim('encoding', 'U+54E6', { charset: 'unicode' })

test('a record with no claim that decides has no status', () => {
  expect(statusOf([])).toBeNull()
  expect(statusOf([claim('ids', '⿰口我'), claim('meaning', 'oh'), relation('哦', 'similar'), relation('哦', 'not_variant')])).toBeNull()
})

test('a Unicode code makes a record encoded, and another set does not', () => {
  expect(statusOf([unicode])).toBe('encoded')
  expect(statusOf([claim('encoding', 'A140', { charset: 'big5' })])).toBeNull()
})

test('unifiable needs no encoded value', () => {
  expect(statusOf([relation('⿰乂也', 'unifiable')])).toBe('unifiable')
})

test('a relation to another record decides nothing', () => {
  for (const relationship of ['unifiable', 'homograph', 'variant', 'erroneous']) expect(statusOf([relation('R+087A', relationship)])).toBeNull()
  expect(statusOf([relation('R+087A', 'unifiable'), relation('衛', 'variant')])).toBe('variant')
})

test('a homograph, variant or erroneous form of an encoded character takes that status', () => {
  expect(statusOf([relation('哦', 'homograph')])).toBe('homograph')
  expect(statusOf([relation('哦', 'variant')])).toBe('variant')
  expect(statusOf([relation('哦', 'erroneous')])).toBe('variant')
  expect(statusOf([relation('𲎿', 'variant')])).toBe('variant')
})

test('a relation to a description sequence, a private use character or several characters decides nothing', () => {
  for (const value of ['⿰乂也', '', '哦哦', '']) for (const relationship of ['homograph', 'variant', 'erroneous']) expect(statusOf([relation(value, relationship)])).toBeNull()
})

test('the first rule that matches wins', () => {
  const homograph = relation('哦', 'homograph'), variant = relation('哦', 'variant'), unifiable = relation('我', 'unifiable')
  expect(statusOf([variant, homograph, unifiable, unicode])).toBe('encoded')
  expect(statusOf([variant, homograph, unifiable])).toBe('unifiable')
  expect(statusOf([variant, homograph])).toBe('homograph')
  expect(statusOf([variant])).toBe('variant')
})
