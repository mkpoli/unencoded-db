// Apply after D1 migrations. Re-running retries unresolved expressions and preserves source text and revision history.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertDate } from '../src/lib/server/hutime'
import { MAX_READING_LENGTH, type DateReading } from '../src/lib/dates'

const [where, mode, ...extra] = process.argv.slice(2)
if (!['--local', '--remote'].includes(where) || (mode && mode !== '--recheck') || extra.length)
  throw new Error('usage: bun scripts/sweep-dates.ts --local|--remote [--recheck]')
function wrangler(...args: string[]) {
  const run = Bun.spawnSync(['bunx', 'wrangler', 'd1', 'execute', 'DB', where, '--yes', ...args], { cwd: join(import.meta.dir, '..') })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString() || run.stdout.toString())
  return run.stdout.toString()
}
const sql = `SELECT value, d.reading AS prior, d.transcription IS NULL AS missing FROM evidence_dates LEFT JOIN date_readings d ON d.transcription = value
  WHERE value IS NOT NULL ${mode === '--recheck' ? '' : 'AND d.reading IS NULL'}`
const dates = JSON.parse(wrangler('--json', '--command', sql))[0].results as { value: string; prior: string | null; missing: number }[]
const rows: [string, DateReading | null, string | null][] = []
let unresolved = 0
for (const { value, prior, missing } of dates) {
  const reading = await convertDate(value)
  if (!reading) unresolved++
  if (value.length <= MAX_READING_LENGTH && (missing || (reading && JSON.stringify(reading) !== prior))) rows.push([value, reading, prior])
}
const folder = mkdtempSync(join(tmpdir(), 'date-readings-'))
try {
  const literal = (value: string | null) => value === null ? 'NULL' : "'" + value.replaceAll("'", "''") + "'"
  // Replace only the reading seen during discovery. A concurrent repair wins.
  const statements = rows.map(([text, reading, prior]) =>
    `INSERT INTO date_readings VALUES (${literal(text)}, ${literal(reading && JSON.stringify(reading))}) ON CONFLICT(transcription) DO UPDATE SET reading = excluded.reading WHERE date_readings.reading IS ${literal(prior)};`)
  // A revision may have been redacted since discovery. Remove cache entries no longer cited.
  statements.push('DELETE FROM date_readings WHERE transcription NOT IN (SELECT value FROM evidence_dates WHERE value IS NOT NULL);')
  statements.push(readFileSync(join(import.meta.dir, 'reindex-dates.sql'), 'utf8'))
  const file = join(folder, 'sweep.sql')
  writeFileSync(file, statements.join('\n'))
  wrangler('--file', file)
} finally { rmSync(folder, { recursive: true, force: true }) }
console.log(`${dates.length} distinct date expressions checked, ${unresolved} unresolved.`)
