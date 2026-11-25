import { formOf } from '../src/lib/forms'
import { executeD1, importD1 } from './d1'

// Reconcile the forms of records written before they were kept, or before the IWDS groups changed.
const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-forms.ts --local|--remote')
const read = <Row>(query: string) => JSON.parse(executeD1(where, '--json', '--command', query))[0].results as Row[]
const LIVE = "FROM claims c JOIN entries e ON e.id = c.entry_id WHERE c.kind = 'ids' AND e.merged_into IS NULL AND e.hidden_at IS NULL"
const described = read<{ entry_id: number; value: string }>(`SELECT c.entry_id, c.value ${LIVE}`)
const held = read<{ entry_id: number; form: string }>('SELECT entry_id, form FROM forms')
const literal = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const key = (entry: number, form: string) => `${entry}\n${form}`
const have = new Set(held.map(row => key(row.entry_id, row.form))), want = new Set<string>()
const updates: string[] = []
for (const { entry_id, value } of described) {
  const form = formOf(value)
  if (form === null || want.has(key(entry_id, form))) continue
  want.add(key(entry_id, form))
  // A record changed since the read keeps what that change filed.
  if (!have.has(key(entry_id, form))) updates.push(`INSERT INTO forms(form, entry_id) SELECT ${literal(form)}, ${entry_id} WHERE EXISTS (SELECT 1 ${LIVE} AND e.id = ${entry_id} AND c.value = ${literal(value)}) AND NOT EXISTS (SELECT 1 FROM forms WHERE form = ${literal(form)} AND entry_id = ${entry_id});`)
}
for (const row of held) if (!want.has(key(row.entry_id, row.form))) updates.push(`DELETE FROM forms WHERE form = ${literal(row.form)} AND entry_id = ${row.entry_id};`)
if (updates.length) importD1(where, updates.join('\n'))
console.log(`${described.length} descriptions checked, ${updates.length} forms corrected.`)
