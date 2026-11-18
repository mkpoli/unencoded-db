// Apply after D1 migrations. Re-running retries unresolved expressions and preserves source text and revision history.
import { readFileSync } from 'node:fs'
import { executeD1, importD1 } from './d1'
import { join } from 'node:path'
import { convertDate } from '../src/lib/server/hutime'
import { MAX_READING_LENGTH, type DateReading } from '../src/lib/dates'

const [where, mode, ...extra] = process.argv.slice(2)
if (!['--local', '--remote'].includes(where) || (mode && mode !== '--recheck') || extra.length)
  throw new Error('usage: bun scripts/sweep-dates.ts --local|--remote [--recheck]')
const sql = `SELECT value, d.reading AS prior, d.transcription IS NULL AS missing FROM evidence_dates LEFT JOIN date_readings d ON d.transcription = value
  WHERE value IS NOT NULL ${mode === '--recheck' ? '' : 'AND d.reading IS NULL'}`
const dates = JSON.parse(executeD1(where, '--json', '--command', sql))[0].results as { value: string; prior: string | null; missing: number }[]
const rows: [string, DateReading | null, string | null][] = []
let unresolved = 0
for (const { value, prior, missing } of dates) {
  const reading = await convertDate(value)
  if (!reading) unresolved++
  if (value.length <= MAX_READING_LENGTH && (missing || (reading && JSON.stringify(reading) !== prior))) rows.push([value, reading, prior])
}
const literal = (value: string | null) => value === null ? 'NULL' : "'" + value.replaceAll("'", "''") + "'"
// Replace only the reading seen during discovery. A concurrent repair wins.
const statements = rows.map(([text, reading, prior]) =>
  `INSERT INTO date_readings VALUES (${literal(text)}, ${literal(reading && JSON.stringify(reading))}) ON CONFLICT(transcription) DO UPDATE SET reading = excluded.reading WHERE date_readings.reading IS ${literal(prior)};`)
// A revision may have been redacted since discovery. Remove cache entries no longer cited.
statements.push('DELETE FROM date_readings WHERE transcription NOT IN (SELECT value FROM evidence_dates WHERE value IS NOT NULL);')
statements.push(readFileSync(join(import.meta.dir, 'reindex-dates.sql'), 'utf8'))
importD1(where, statements.join('\n'))
console.log(`${dates.length} distinct date expressions checked, ${unresolved} unresolved.`)
