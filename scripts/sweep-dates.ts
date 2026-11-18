// Apply after D1 migrations. Re-running retries unresolved expressions and preserves source text and revision history.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertDate } from '../src/lib/server/hutime'
import type { DateReading } from '../src/lib/dates'

const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-dates.ts --local|--remote')
function wrangler(...args: string[]) {
  const run = Bun.spawnSync(['bunx', 'wrangler', 'd1', 'execute', 'DB', where, '--yes', ...args], { cwd: join(import.meta.dir, '..') })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString() || run.stdout.toString())
  return run.stdout.toString()
}
const sql = `WITH dates(value) AS (
  SELECT report_date FROM sources UNION SELECT original_date FROM sightings
  UNION SELECT snapshot ->> '$.report_date' FROM revisions WHERE kind IN ('sighting','sighting_edit') AND redacted_at IS NULL
  UNION SELECT snapshot ->> '$.original_date' FROM revisions WHERE kind IN ('sighting','sighting_edit') AND redacted_at IS NULL
  UNION SELECT via.value ->> '$.report_date' FROM revisions r, json_each(r.snapshot, '$.vias') via
    WHERE r.kind IN ('sighting','sighting_edit') AND r.redacted_at IS NULL
) SELECT value, d.transcription IS NULL AS missing FROM dates LEFT JOIN date_readings d ON d.transcription = value
  WHERE value IS NOT NULL AND d.reading IS NULL`
const dates = JSON.parse(wrangler('--json', '--command', sql))[0].results as { value: string; missing: number }[]
const rows: [string, DateReading | null][] = []
let unresolved = 0
for (const { value, missing } of dates) {
  const reading = await convertDate(value)
  if (!reading) unresolved++
  if (reading || missing) rows.push([value, reading])
}
const folder = mkdtempSync(join(tmpdir(), 'date-readings-'))
try {
  const statements = rows.map(row => {
    const json = JSON.stringify(row).replaceAll("'", "''")
    return `INSERT INTO date_readings SELECT value ->> 0, value ->> 1 FROM json_each('[${json}]') WHERE true ON CONFLICT(transcription) DO UPDATE SET reading = excluded.reading WHERE date_readings.reading IS NULL;`
  })
  statements.push(readFileSync(join(import.meta.dir, 'reindex-dates.sql'), 'utf8'))
  const file = join(folder, 'sweep.sql')
  writeFileSync(file, statements.join('\n'))
  wrangler('--file', file)
} finally { rmSync(folder, { recursive: true, force: true }) }
console.log(`${dates.length} distinct date expressions checked, ${unresolved} unresolved.`)
