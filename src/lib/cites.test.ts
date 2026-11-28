import { expect, test } from 'bun:test'
import { dateOrderWarnings } from './cites'
import { Database } from 'bun:sqlite'
import { datingOriginal } from './scripts'

test('warns when a via predates the work or a cite postdates it', () => {
  expect(dateOrderWarnings(
    { report_date: '1990', original_date: '1716' },
    [{ report_date: '2024' }, { report_date: '1666' }],
    [{ report_date: '1666' }, { report_date: '2020' }],
  )).toEqual([
    { side: 'via', index: 1, viaYear: 1666, workYear: 1716 },
    { side: 'cite', index: 1, citeYear: 2020, workYear: 1990 },
  ])
})

test('allows an edition whose original date matches the base printing without false positives', () => {
  expect(dateOrderWarnings(
    { report_date: '1986', original_date: '1716' },
    [{ report_date: '2025-05-01' }],
    [{ target_original_date: '1716', target_report_date: '1716' }],
  )).toEqual([])
})

test('a secondary or remembered work is dated by its report alone', () => {
  const vias = [{ report_date: '1700' }]
  expect(dateOrderWarnings({ report_date: '1994', original_date: '1606' }, vias, [])).toEqual([])
  for (const closeness of ['secondary_cited', 'secondary_uncited', 'memory'])
    expect(dateOrderWarnings({ report_date: '1994', original_date: '1606', closeness }, vias, [])).toEqual([{ side: 'via', index: 0, viaYear: 1700, workYear: 1994 }])
})

test('SQL reads an original date only where it dates the sighting', () => {
  const db = new Database(':memory:')
  db.exec("CREATE TABLE sightings (id INTEGER, closeness TEXT, original_date TEXT); INSERT INTO sightings VALUES (1, NULL, '1606'), (2, 'primary', '1606'), (3, 'secondary_cited', '1606'), (4, 'memory', '1606')")
  expect(db.query(`SELECT ${datingOriginal('s')} AS d FROM sightings s ORDER BY id`).all()).toEqual([{ d: '1606' }, { d: '1606' }, { d: null }, { d: null }])
})
