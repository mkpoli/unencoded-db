import { describe, expect, test } from 'bun:test'
import { parseDate } from './evidence-links'

describe('partial dates', () => {
  test('keeps the recorded precision', () => {
    expect(parseDate('1998')).toEqual({ date_year: 1998, date_month: null, date_day: null, date_precision: 'year' })
    expect(parseDate('1998-05')).toEqual({ date_year: 1998, date_month: 5, date_day: null, date_precision: 'month' })
    expect(parseDate('1998-05-12')).toEqual({ date_year: 1998, date_month: 5, date_day: 12, date_precision: 'day' })
    expect(parseDate('05')).toEqual({ date_year: null, date_month: 5, date_day: null, date_precision: 'month-only' })
  })

  test('rejects impossible parts and keeps free text', () => {
    expect(parseDate('1998-13')).toEqual({ date_year: null, date_month: null, date_day: null, date_precision: 'text' })
    expect(parseDate('1998-02-30').date_precision).toBe('text')
    expect(parseDate('1900-02-29').date_precision).toBe('text')
    expect(parseDate('ca. 1900')).toEqual({ date_year: null, date_month: null, date_day: null, date_precision: 'text' })
  })

  test('accepts leap days in leap years, including year zero', () => {
    expect(parseDate('2000-02-29').date_precision).toBe('day')
    expect(parseDate('0400-02-29').date_precision).toBe('day')
    expect(parseDate('0000-02-29').date_precision).toBe('day')
  })
})
