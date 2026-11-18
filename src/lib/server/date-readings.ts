import { type DateReading, westernDate } from '../dates'
import { convertDate } from './hutime'

export type DateBook = Map<string, DateReading | null>
type Dated = { report_date: string | null; original_date: string | null; vias: readonly { report_date: string | null }[] }
export const sightingDates = (rows: readonly Dated[]) => rows.flatMap(row => [row.original_date, row.report_date, ...row.vias.map(via => via.report_date)])

async function storedDates(db: D1Database, dates: string[]): Promise<DateBook> {
  if (!dates.length) return new Map()
  const { results } = await db.prepare('SELECT transcription, reading FROM date_readings WHERE transcription IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(dates)).all<{ transcription: string; reading: string | null }>()
  return new Map(results.map(row => [row.transcription, row.reading === null ? null : JSON.parse(row.reading)]))
}

export async function readDates(db: D1Database, values: readonly (string | null)[], submit = false): Promise<DateBook> {
  const dates = [...new Set(values.filter((value): value is string => !!value))]
  const book = await storedDates(db, dates)
  const missing = dates.filter(date => !book.has(date))
  if (!missing.length) return book
  if (!submit) {
    for (const date of missing) book.set(date, westernDate(date))
    return book
  }
  const rows: [string, DateReading | null][] = []
  for (let i = 0; i < missing.length; i += 3) {
    const batch = missing.slice(i, i + 3)
    const converted = await Promise.all(batch.map(date => convertDate(date)))
    batch.forEach((date, j) => rows.push([date, converted[j]]))
  }
  await db.prepare('INSERT OR IGNORE INTO date_readings SELECT value ->> 0, value ->> 1 FROM json_each(?)').bind(JSON.stringify(rows)).run()
  // Concurrent submissions of the same transcription use the same stored interpretation.
  for (const [date, reading] of await storedDates(db, missing)) book.set(date, reading)
  return book
}

export function datedYear(value: string | null, book: DateBook) {
  if (!value) return null
  const reading = book.has(value) ? book.get(value) : westernDate(value)
  if (!reading) return null
  const n = Number(reading.start.slice(0, 4))
  return { text: String(n), n }
}
