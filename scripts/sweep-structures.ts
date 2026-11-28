import { partRowsOf } from '../src/lib/structure'
import { executeD1, importD1 } from './d1'

// Bring the part and structure rows of every record to what its descriptions give now: filed for records
// described before those rows were kept, and taken away where the keys have changed since.
const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-structures.ts --local|--remote')
const read = <Row>(query: string) => JSON.parse(executeD1(where, '--json', '--command', query))[0].results as Row[]
const LIVE = "FROM claims c JOIN entries e ON e.id = c.entry_id WHERE c.kind = 'ids' AND e.merged_into IS NULL AND e.hidden_at IS NULL"
const CHANGED = 'SELECT COALESCE(MAX(id), 0) FROM revisions WHERE entry_id ='
// Read before the descriptions, with the last change of each record: a row goes only while that is still its last.
const held = read<{ entry_id: number; tag: string; change: number }>(`SELECT entry_id, tag, (${CHANGED} entry_tags.entry_id) AS change FROM entry_tags WHERE tag >= 'p:' AND tag < 'p;'`)
const described = read<{ entry_id: number; value: string }>(`SELECT c.entry_id, c.value ${LIVE}`)
const literal = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const key = (entry: number, tag: string) => `${entry}\n${tag}`
const have = new Set(held.map(row => key(row.entry_id, row.tag))), want = new Set<string>()
const updates: string[] = []
for (const { entry_id, value } of described) {
  for (const tag of partRowsOf(value)) {
    if (want.has(key(entry_id, tag))) continue
    want.add(key(entry_id, tag))
    // Filed only while the record still states the description.
    if (!have.has(key(entry_id, tag))) updates.push(`INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year) SELECT ${literal(tag)}, ${entry_id}, 0, NULL WHERE EXISTS (SELECT 1 ${LIVE} AND e.id = ${entry_id} AND c.value = ${literal(value)});`)
  }
}
const filed = updates.length
for (const row of held) if (!want.has(key(row.entry_id, row.tag))) updates.push(`DELETE FROM entry_tags WHERE tag = ${literal(row.tag)} AND entry_id = ${row.entry_id} AND (${CHANGED} ${row.entry_id}) = ${row.change};`)
if (updates.length) importD1(where, updates.join('\n'))
console.log(`${described.length} descriptions checked, ${filed} rows filed, ${updates.length - filed} taken away.`)
