import { sourceNameKey } from '../src/lib/name-key'
import { executeD1, importD1 } from './d1'

const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-source-names.ts --local|--remote')

type Row = { id: number; hash: string; name: string; name_lookup: string | null }
const literal = (value: string) => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
let after = 0, corrected = 0
for (;;) {
  const query = `SELECT id, hash, coalesce(title, url, author, publisher, report_date, container, '') AS name, name_lookup
    FROM sources WHERE id > ${after} ORDER BY id LIMIT 500`
  const rows: Row[] = JSON.parse(executeD1(where, '--json', '--command', query))[0].results
  if (!rows.length) break
  const updates = rows.filter(row => sourceNameKey(row.name) !== row.name_lookup).map(row =>
    `UPDATE sources SET name_lookup = ${literal(sourceNameKey(row.name))} WHERE id = ${row.id} AND hash = ${literal(row.hash)};`)
  if (updates.length) importD1(where, updates.join('\n'))
  corrected += updates.length
  after = rows.at(-1)!.id
}
console.log(`${corrected} source name lookup keys corrected.`)
