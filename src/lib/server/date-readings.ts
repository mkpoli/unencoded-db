import { type DateReading, MAX_READING_LENGTH, westernDate, yearOfDay } from '../dates'
import { convertDate } from './hutime'
import reindexSql from '../../../scripts/reindex-dates.sql?raw'

export type DateBook = Map<string, DateReading | null>
type Dated = { report_date: string | null; original_date: string | null; vias: readonly { report_date: string | null }[] }
export const sightingDates = (rows: readonly Dated[]) => rows.flatMap(row => [row.original_date, row.report_date, ...row.vias.map(via => via.report_date)])

async function storedDates(db: D1Database, dates: string[]): Promise<DateBook> {
  const keys = dates.filter(date => date.length <= MAX_READING_LENGTH)
  if (!keys.length) return new Map()
  const { results } = await db.prepare('SELECT transcription, reading FROM date_readings WHERE transcription IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(keys)).all<{ transcription: string; reading: string | null }>()
  return new Map(results.map(row => [row.transcription, row.reading === null ? null : JSON.parse(row.reading)]))
}

const distinct = (values: readonly (string | null)[]) => [...new Set(values.filter((value): value is string => !!value))]

export async function readDates(db: D1Database, values: readonly (string | null)[]): Promise<DateBook> {
  const dates = distinct(values)
  const book = await storedDates(db, dates)
  for (const date of dates) if (!book.has(date)) book.set(date, westernDate(date))
  return book
}

// Keep cache writes in the same transaction as the sighting. When a retry succeeds, older
// occurrences of the same transcription need their source, chronology and decade indexes updated.
export async function prepareDates(db: D1Database, values: readonly (string | null)[], request: typeof fetch = fetch) {
  const dates = distinct(values)
  const book = await storedDates(db, dates)
  const pending = dates.filter(date => date.length <= MAX_READING_LENGTH && !book.get(date))
  const rows: [string, DateReading | null][] = []
  // All drafts of one submission share the same network wait budget.
  const deadline = AbortSignal.timeout(8000)
  let repair = false
  for (let i = 0; i < pending.length; i += 3) {
    const batch = pending.slice(i, i + 3)
    const converted = await Promise.all(batch.map(date => convertDate(date, request, deadline)))
    for (const [j, date] of batch.entries()) {
      const reading = converted[j]
      if (book.has(date) && reading) repair = true
      if (!book.has(date) || reading) rows.push([date, reading])
      book.set(date, reading)
    }
  }
  const save = rows.length ? [db.prepare(`INSERT INTO date_readings SELECT value ->> 0, value ->> 1 FROM json_each(?) WHERE true
    ON CONFLICT(transcription) DO UPDATE SET reading = excluded.reading WHERE date_readings.reading IS NULL AND excluded.reading IS NOT NULL`)
    .bind(JSON.stringify(rows))] : []
  const reindex = repair ? reindexSql.split(';').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)) : []
  return { book, save, reindex }
}

export function datedYear(value: string | null, book: DateBook) {
  if (!value) return null
  const reading = book.has(value) ? book.get(value) : westernDate(value)
  if (!reading) return null
  const n = yearOfDay(reading.start)
  return { text: String(n), n, end: reading.end }
}
