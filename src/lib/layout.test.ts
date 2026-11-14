import { expect, test } from 'bun:test'
import { readClaims, newClaim, parseClaims, primaryLayoutOf } from './claims'
import { cleanLayout, validLayout } from './layout'
import { documentLayout, layoutDocument } from './layout-document'

const IDS = '⿰亻⿱七木'

test('a layout keeps the moved parts of its description, in order and rounded', () => {
  expect(cleanLayout({ '1.0': [1, 0, 0, 1, 12.34567, 0], '0': [0.9, 0, 0, 0.9, 0, 0] }, IDS)).toEqual({ '0': [0.9, 0, 0, 0.9, 0, 0], '1.0': [1, 0, 0, 1, 12.3457, 0] })
  expect(cleanLayout('{"":[1,0,0,1,0,20]}', IDS)).toEqual({ '': [1, 0, 0, 1, 0, 20] })
})

test('a part left where the composer put it has no entry', () => {
  expect(cleanLayout({ '0': [1, 0, 0, 1, 0, 0] }, IDS)).toBeNull()
  expect(cleanLayout({ '0': [1, 0, 0, 1, 0, 0], '1': [1, 0, 0, 1, 5, 0] }, IDS)).toEqual({ '1': [1, 0, 0, 1, 5, 0] })
})

test('a layout names only parts the description has, with matrices that draw', () => {
  for (const bad of [{ '2': [1, 0, 0, 1, 5, 0] }, { '0.0': [1, 0, 0, 1, 5, 0] }, { '0': [0, 0, 0, 0, 5, 0] }, { '0': [1, 0, 0, 1, 5] }, { '0': [1, 0, 0, 1, 5, Infinity] }, { 'x': [1, 0, 0, 1, 5, 0] }, [], 'no', null]) {
    expect(cleanLayout(bad, IDS)).toBeNull()
  }
  expect(cleanLayout({ '0': [1, 0, 0, 1, 5, 0] }, '⿰亻')).toBeNull()
})

test('a stored layout is valid only as this app writes it', () => {
  expect(validLayout({ '0': [1, 0, 0, 1, 5, 0] }, IDS)).toBe(true)
  expect(validLayout({ '0': [1, 0, 0, 1, 5.00001, 0] }, IDS)).toBe(false)
  expect(validLayout({ '1.1': [1, 0, 0, 1, 5, 0], '1.0': [1, 0, 0, 1, 5, 0] }, IDS)).toBe(false)
})

test('a layout becomes a document and comes back from it', () => {
  const layout = { '0': [1, 0, 0, 1, -40, 12], '1.1': [0.9, 0, 0, 0.9, 50, 100] }
  const document = layoutDocument(IDS, layout)!
  expect(document.root.kind).toBe('operator')
  expect(documentLayout(document, IDS)).toEqual(layout)
  expect(documentLayout(layoutDocument(IDS, null)!, IDS)).toBeNull()
  expect(layoutDocument('⿰亻', null)).toBeNull()
})

const form = (fields: [string, string][]) => { const data = new FormData(); for (const [name, value] of fields) data.append(name, value); return data }

test('a form states the layout of its first description', () => {
  const { claims, error } = readClaims(form([['ids', IDS], ['ids', '⿰亻桼'], ['layout', '{"0":[1,0,0,1,-40,12]}']]))
  expect(error).toBeNull()
  expect(claims.map(claim => claim.data)).toEqual([{ layout: { '0': [1, 0, 0, 1, -40, 12] } }, null])
  expect(primaryLayoutOf(claims)).toEqual({ '0': [1, 0, 0, 1, -40, 12] })
  expect(parseClaims(JSON.stringify(claims))).toEqual(claims)
})

test('an empty layout field takes the layout away, and a form without the field keeps it', () => {
  const base = [newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12] } })]
  expect(readClaims(form([['ids', IDS], ['layout', '']]), base).claims[0].data).toBeNull()
  expect(readClaims(form([['ids', IDS]]), base).claims[0].data).toEqual(base[0].data)
  expect(readClaims(form([['ids', IDS]]), base).claims[0].key).toBe(base[0].key)
  expect(readClaims(form([['description', 'x']]), base).claims[0]).toEqual(base[0])
})

test('a layout does not follow another description', () => {
  const base = [newClaim('ids', IDS, { layout: { '1.0': [1, 0, 0, 1, -40, 12] } })]
  expect(readClaims(form([['ids', '⿰亻桼']]), base).claims[0].data).toBeNull()
  expect(readClaims(form([['ids', '⿰亻桼'], ['layout', '{"1.0":[1,0,0,1,-40,12]}']]), base).claims[0].data).toBeNull()
})

test('a stored description holds nothing but a layout of its own', () => {
  const claim = newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12] } })
  expect(parseClaims([claim])).not.toBeNull()
  expect(parseClaims([{ ...claim, data: { layout: { '5': [1, 0, 0, 1, -40, 12] } } }])).toBeNull()
  expect(parseClaims([{ ...claim, data: { layout: { '0': [1, 0, 0, 1, -40, 12] }, other: 1 } }])).toBeNull()
  expect(parseClaims([{ ...claim, data: {} }])).toBeNull()
})
