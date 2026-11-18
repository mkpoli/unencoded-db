import { nameKey, nameLabel } from '../src/lib/name-key'
import { executeD1, importD1 } from './d1'

// Reconcile spellings written before the Unicode-aware writer took over.
const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-publishers.ts --local|--remote')
const query = 'SELECT DISTINCT publisher, publisher_lookup FROM sources WHERE publisher IS NOT NULL'
const rows = JSON.parse(executeD1(where, '--json', '--command', query))[0].results as { publisher: string; publisher_lookup: string | null }[]
const literal = (text: string | null) => text === null ? 'NULL' : `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const updates: string[] = []
let corrected = 0
for (const row of rows) {
  const key = nameKey(row.publisher) || null
  if (key !== row.publisher_lookup) {
    corrected++
    updates.push(`UPDATE sources SET publisher_lookup = ${literal(key)}
    WHERE publisher_lookup IS ${literal(row.publisher_lookup)} AND publisher = ${literal(row.publisher)};`)
  }
  const label = nameLabel(row.publisher)
  if (label !== row.publisher && key) updates.push(`UPDATE publishers SET name = ${literal(label)} WHERE lookup = ${literal(key)} AND name = ${literal(row.publisher)};`)
}
if (updates.length) importD1(where, updates.join('\n'))
console.log(`${rows.length} publisher spellings checked, ${corrected} lookup keys corrected.`)
