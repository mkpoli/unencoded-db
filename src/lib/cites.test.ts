import { expect, test } from 'bun:test'
import { dateOrderWarnings } from './cites'

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
