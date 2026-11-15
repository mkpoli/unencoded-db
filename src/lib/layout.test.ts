import { expect, test } from 'bun:test'
import { readClaims, newClaim, parseClaims, primaryLayoutOf } from './claims'
import { carryLayout, cleanLayout, validLayout } from './layout'
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

test('a layout leaves out what is no move of a part of the description', () => {
  const kept = { '1': [1, 0, 0, 1, 5, 0] }
  for (const bad of [{ '2': [1, 0, 0, 1, 5, 0] }, { '0.0': [1, 0, 0, 1, 5, 0] }, { '0': [0, 0, 0, 0, 5, 0] }, { '0': [1, 0, 0, 1, 5] }, { '0': [1, 0, 0, 1, 5, Infinity] }, { '0': [0.00004, 0, 0, 1, 5, 0] }, { '01': [1, 0, 0, 1, 5, 0] }, { '1.00': [1, 0, 0, 1, 5, 0] }, { 'x': [1, 0, 0, 1, 5, 0] }]) {
    expect(cleanLayout(bad, IDS)).toBeNull()
    expect(cleanLayout({ ...bad, ...kept }, IDS)).toEqual(kept)
  }
  for (const bad of [[], 'no', null, 5]) expect(cleanLayout(bad, IDS)).toBeNull()
  expect(cleanLayout(kept, '')).toBeNull()
})

test('a description that is still being built keeps the moves of the parts it has', () => {
  expect(cleanLayout({ '0': [1, 0, 0, 1, 5, 0], '1': [1, 0, 0, 1, 5, 0] }, '⿰亻⬚')).toEqual({ '0': [1, 0, 0, 1, 5, 0] })
})

test('a stored layout is valid only as this app writes it', () => {
  expect(validLayout({ '0': [1, 0, 0, 1, 5, 0] }, IDS)).toBe(true)
  expect(validLayout({ '0': [1, 0, 0, 1, 5.00001, 0] }, IDS)).toBe(false)
  expect(validLayout({ '1.1': [1, 0, 0, 1, 5, 0], '1.0': [1, 0, 0, 1, 5, 0] }, IDS)).toBe(false)
  expect(validLayout({ '0': [1, 0, 0, 1, 5, 0], '2': [1, 0, 0, 1, 5, 0] }, IDS)).toBe(false)
  expect(validLayout(cleanLayout({ '0': [0.0011, 0, 0, 0.00091, 0, 0], '1': [1, 0, 0, 1, 5, 0] }, IDS), IDS)).toBe(true)
})

test('a move stays with its part while the description around it changes, and goes when the part is replaced', () => {
  const layout = { '0': [1, 0, 0, 1, -40, 12], '1': [0.9, 0, 0, 0.9, 0, 0], '1.0': [1, 0, 0, 1, 0, 30] }
  expect(carryLayout(layout, IDS, IDS)).toEqual(layout)
  expect(carryLayout(layout, IDS, '⿰亻⿱七林')).toEqual({ '0': [1, 0, 0, 1, -40, 12], '1.0': [1, 0, 0, 1, 0, 30] })
  expect(carryLayout(layout, IDS, '⿰木⿱七木')).toEqual({ '1': [0.9, 0, 0, 0.9, 0, 0], '1.0': [1, 0, 0, 1, 0, 30] })
  expect(carryLayout(layout, IDS, '⿰木木')).toBeNull()
  expect(carryLayout(layout, IDS, '⿰亻⬚')).toEqual({ '0': [1, 0, 0, 1, -40, 12] })
  expect(carryLayout(layout, IDS, '')).toBeNull()
  expect(carryLayout(null, IDS, IDS)).toBeNull()
})

test('a layout becomes a document and comes back from it', () => {
  const layout = { '0': [1, 0, 0, 1, -40, 12], '1.1': [0.9, 0, 0, 0.9, 50, 100] }
  const document = layoutDocument(IDS, layout)!
  expect(document.root.kind).toBe('operator')
  expect(documentLayout(document, IDS)).toEqual(layout)
  expect(documentLayout(layoutDocument(IDS, null)!, IDS)).toBeNull()
  expect(documentLayout(layoutDocument('⿰亻⬚', { '0': [1, 0, 0, 1, 5, 0] })!, '⿰亻⬚')).toEqual({ '0': [1, 0, 0, 1, 5, 0] })
  expect(layoutDocument('', null)).toBeNull()
})

const form = (fields: [string, string][]) => { const data = new FormData(); for (const [name, value] of fields) data.append(name, value); return data }

test('a form states the layout of its first description', () => {
  const { claims, error } = readClaims(form([['ids', IDS], ['ids', '⿰亻桼'], ['layout', '{"0":[1,0,0,1,-40,12]}'], ['layout_ids', IDS]]))
  expect(error).toBeNull()
  expect(claims.map(claim => claim.data)).toEqual([{ layout: { '0': [1, 0, 0, 1, -40, 12] } }, null])
  expect(primaryLayoutOf(claims)).toEqual({ '0': [1, 0, 0, 1, -40, 12] })
  expect(parseClaims(JSON.stringify(claims))).toEqual(claims)
})

test('an empty layout takes the layout away, and a form that states none keeps it', () => {
  const base = [newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12] } })]
  expect(readClaims(form([['ids', IDS], ['layout', ''], ['layout_ids', IDS]]), base).claims[0].data).toBeNull()
  expect(readClaims(form([['ids', IDS]]), base).claims[0].data).toEqual(base[0].data)
  expect(readClaims(form([['ids', IDS]]), base).claims[0].key).toBe(base[0].key)
  expect(readClaims(form([['ids', IDS], ['layout', ''], ['layout_ids', '']]), base).claims[0].data).toEqual(base[0].data)
  expect(readClaims(form([['description', 'x']]), base).claims[0]).toEqual(base[0])
})

test('a layout goes with the parts a changed description kept', () => {
  const base = [newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12], '1.0': [1, 0, 0, 1, 0, 30] } })]
  const layout = JSON.stringify(base[0].data!.layout)
  expect(readClaims(form([['ids', '⿰亻桼']]), base).claims[0].data).toBeNull()
  expect(readClaims(form([['ids', '⿰亻桼'], ['layout', layout], ['layout_ids', IDS]]), base).claims[0].data).toEqual({ layout: { '0': [1, 0, 0, 1, -40, 12] } })
  expect(readClaims(form([['ids', '⿰木木'], ['layout', layout], ['layout_ids', IDS]]), base).claims[0].data).toBeNull()
})

test('a description that becomes the first keeps its own layout', () => {
  const second = { layout: { '1': [1, 0, 0, 1, 0, 30] } }
  const base = [newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12] } }), newClaim('ids', '⿰亻桼', second)]
  expect(readClaims(form([['ids', ''], ['ids', '⿰亻桼'], ['layout', ''], ['layout_ids', '']]), base).claims.map(claim => claim.data)).toEqual([second])
  expect(readClaims(form([['ids', ''], ['ids', '⿰亻桼'], ['layout', '{"0":[1,0,0,1,-40,12]}'], ['layout_ids', IDS]]), base).claims.map(claim => claim.data)).toEqual([second])
})

test('a stored description holds nothing but a layout of its own', () => {
  const claim = newClaim('ids', IDS, { layout: { '0': [1, 0, 0, 1, -40, 12] } })
  expect(parseClaims([claim])).not.toBeNull()
  expect(parseClaims([{ ...claim, data: { layout: { '5': [1, 0, 0, 1, -40, 12] } } }])).toBeNull()
  expect(parseClaims([{ ...claim, data: { layout: { '0': [1, 0, 0, 1, -40, 12] }, other: 1 } }])).toBeNull()
  expect(parseClaims([{ ...claim, data: {} }])).toBeNull()
})
