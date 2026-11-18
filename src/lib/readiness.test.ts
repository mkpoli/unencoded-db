import { expect, test } from 'bun:test'
import { readiness, readyTarget, type ReadySighting } from './readiness'

const seen = (id: number, over: Partial<ReadySighting> = {}): ReadySighting => ({
  id, media: [], title: null, author: null, publisher: null, report_date: null, page: null, context: null, style: null, ...over,
})

test('an unfilled check points at the sighting and the part of its form that fills it', () => {
  const bare = seen(1)
  const pictured = seen(2, { media: [{ box: null }] })
  const cited = seen(3, { title: 'Book', author: 'Author', publisher: 'Press', report_date: '2026', page: '12', style: 'regular', context: 'running_text' })
  expect(readyTarget('page', [pictured])).toEqual({ id: 2, place: 'pictures' })
  expect(readyTarget('page', [pictured, bare])).toEqual({ id: 1, place: 'pictures' })
  expect(readyTarget('mark', [bare, pictured])).toEqual({ id: 2, place: 'pictures' })
  expect(readyTarget('reference', [pictured, cited])).toEqual({ id: 2, place: 'source' })
  expect(readyTarget('regular', [pictured, cited])).toEqual({ id: 2, place: 'source-style' })
  expect(readyTarget('running', [pictured, cited])).toEqual({ id: 2, place: 'source-context' })
})

test('a sighting check has no target when the record has no sighting', () => {
  expect(readyTarget('page', [])).toBeNull()
  expect(readyTarget('mark', [])).toBeNull()
  expect(readyTarget('reference', [])).toBeNull()
})

test('readiness reads each check from the record and its sightings', () => {
  const complete = readiness({ ids: '⿰山東', radical: '山', strokes: 6 }, [
    { media: [{ box: '[1,2,3,4]' }], title: 'Book', author: 'Author', publisher: 'Press', report_date: '2026', page: '12', context: 'running_text', style: 'regular' },
  ])
  expect(complete).toEqual({ page: true, mark: true, reference: true, ids: true, radical: true, regular: true, running: true, second: false })
  expect(readiness({ ids: null, radical: null, strokes: null }, [])).toEqual({ page: false, mark: false, reference: false, ids: false, radical: false, regular: false, running: false, second: false })
})
