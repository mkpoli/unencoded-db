// Files every listed record under its radical again: the `b:` and `b!` rows of `entry_tags` and their counts.
// A record is filed when it is written; this is for the records written before radicals were indexed,
// and for after src/lib/radical-tables.ts is rebuilt. A record written between the read and the write
// keeps the path it had at the read until it is written again, so pause writes (WRITES_PAUSED) for the run.
//
//   bun scripts/file-radicals.ts --local
//   bun scripts/file-radicals.ts --remote
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileRecord, pathsOf } from '../src/lib/radicals'

const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/file-radicals.ts --local|--remote')
const wrangler = (...args: string[]) => {
  const run = Bun.spawnSync(['bunx', 'wrangler', 'd1', 'execute', 'DB', where, '--yes', ...args], { cwd: join(import.meta.dir, '..') })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString() || run.stdout.toString())
  return run.stdout.toString()
}

// `sightings` repeats the count the other rows of the record carry, which the lists by count read.
const listed = JSON.parse(wrangler('--json', '--command', "SELECT e.id, e.ids, e.radical, t.sightings FROM entry_tags t JOIN entries e ON e.id = t.entry_id WHERE t.tag = 'all'"))[0].results as { id: number; ids: string | null; radical: string | null; sightings: number }[]
const quote = (text: string) => `'${text.replace(/'/g, "''")}'`
const rows = listed.flatMap(entry => {
  const filing = fileRecord(entry.ids, entry.radical)
  return [...pathsOf(filing?.path ?? []).map(path => `b:${path}`), ...(filing?.stated ? [`b!${filing.stated}`] : [])].map(tag => `(${quote(tag)}, ${entry.id}, ${entry.sightings})`)
})
const statements = ["DELETE FROM entry_tags WHERE tag >= 'b!' AND tag < 'b;';"]
for (let from = 0; from < rows.length; from += 200) statements.push(`INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings) VALUES ${rows.slice(from, from + 200).join(', ')};`)
statements.push("DELETE FROM tag_counts WHERE tag >= 'b!' AND tag < 'b;';", "INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM entry_tags WHERE tag >= 'b!' AND tag < 'b;' GROUP BY tag;")

const folder = mkdtempSync(join(tmpdir(), 'file-radicals-'))
try {
  const file = join(folder, 'file.sql')
  writeFileSync(file, statements.join('\n') + '\n')
  wrangler('--file', file)
} finally {
  rmSync(folder, { recursive: true, force: true })
}
console.log(`${listed.length} records, ${rows.length} rows`)
