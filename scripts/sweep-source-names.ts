import { authorKeys, sourceKeys, sourceNameKey } from '../src/lib/name-key'
import { executeD1, importD1 } from './d1'

const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-source-names.ts --local|--remote')

type Row = { id: number; hash: string; name: string; name_lookup: string | null; records: number; author: string | null; container: string | null; url: string | null; keys: string }
const literal = (value: string) => `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`
let after = 0, corrected = 0
for (;;) {
  const query = `SELECT id, hash, coalesce(title, url, author, publisher, report_date, container, '') AS name, name_lookup, records,
      author, container, url, (SELECT json_group_array(json_array(lookup, author)) FROM source_keys WHERE source_id = sources.id) AS keys
    FROM sources WHERE id > ${after} ORDER BY id LIMIT 500`
  const rows: Row[] = JSON.parse(executeD1(where, '--json', '--command', query))[0].results
  if (!rows.length) break
  const updates = rows.flatMap(row => {
    const source = `id = ${row.id} AND hash = ${literal(row.hash)}`
    const stored = new Map<string, number>(JSON.parse(row.keys)), wanted = sourceKeys(row), authors = new Set(authorKeys(row.author))
    const flag = (key: string) => !authors.has(key) ? 0 : row.records > 0 ? 1 : 2
    const missing = wanted.filter(key => !stored.has(key)), stale = [...stored.keys()].filter(key => !wanted.includes(key))
    const marked = wanted.filter(key => stored.has(key) && stored.get(key) !== flag(key))
    return [
      ...(sourceNameKey(row.name) === row.name_lookup ? [] : [`UPDATE sources SET name_lookup = ${literal(sourceNameKey(row.name))} WHERE ${source};`]),
      ...missing.map(key => `INSERT OR IGNORE INTO source_keys(lookup, source_id, author) SELECT ${literal(key)}, id, ${flag(key)} FROM sources WHERE ${source};`),
      ...marked.map(key => `UPDATE source_keys SET author = ${flag(key)} WHERE lookup = ${literal(key)} AND source_id = (SELECT id FROM sources WHERE ${source});`),
      ...stale.map(key => `DELETE FROM source_keys WHERE lookup = ${literal(key)} AND source_id = (SELECT id FROM sources WHERE ${source});`),
    ]
  })
  if (updates.length) importD1(where, updates.join('\n'))
  corrected += updates.length
  after = rows.at(-1)!.id
}
console.log(`${corrected} source lookup keys corrected.`)
