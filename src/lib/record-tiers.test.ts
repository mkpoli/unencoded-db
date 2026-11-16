import { expect, test } from 'bun:test'
import { tierRecords, type RecordCandidate } from './record-tiers'

const none = { described: new Map<string, string>() }
const record = (id: number, descriptions: string[], exact = false): RecordCandidate => ({ id, ids: descriptions[0], layout: null, cover_key: null, descriptions, exact })
const tiers = (query: string, records: RecordCandidate[]) => Object.fromEntries(tierRecords(query, records, none).map(hit => [hit.record.id, hit.tier]))

test('a record matched only by its second description is the same', () => {
  expect(tiers('⿰人水', [record(1, ['⿰亻⿱木木', '⿰人水'])])).toEqual({ 1: 'same' })
})

test('a radical form is probable, not the same', () => {
  expect(tiers('⿱⺾木', [record(1, ['⿱艹木'])])).toEqual({ 1: 'probable' })
})

test('an exact hit of the server is the same without the table', () => {
  expect(tiers('⿰人水', [record(1, [], true)])).toEqual({ 1: 'same' })
})

test('a placeholder query is only similar, even to an exact hit', () => {
  expect(tiers('⿰木？', [record(1, ['⿰木？'], true), record(2, ['⿰木水'])])).toEqual({ 1: 'similar', 2: 'similar' })
})
