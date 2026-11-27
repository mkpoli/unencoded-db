import { partRowsOf } from '../src/lib/structure'
import { executeD1, importD1 } from './d1'

// File the part and structure rows of records described before those rows were kept, or before the keys changed.
const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-structures.ts --local|--remote')
const read = <Row>(query: string) => JSON.parse(executeD1(where, '--json', '--command', query))[0].results as Row[]
const LIVE = "FROM claims c JOIN entries e ON e.id = c.entry_id WHERE c.kind = 'ids' AND e.merged_into IS NULL AND e.hidden_at IS NULL"
const held = read<{ entry_id: number; tag: string }>("SELECT entry_id, tag FROM entry_tags WHERE tag >= 'p:' AND tag < 'p;'")
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
if (updates.length) importD1(where, updates.join('\n'))
console.log(`${described.length} descriptions checked, ${updates.length} structure rows filed.`)
