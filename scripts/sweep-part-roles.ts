import { parseComposition, partRoleRowsOf } from '../src/lib/composition'
import { executeD1, importD1 } from './d1'

// Reconcile `entry_part_roles` for records written before migration 0067 or with legacy
// composition claims that omitted explicit `parts`, using the exact TypeScript canonicalization.
const [where] = process.argv.slice(2)
if (where !== '--local' && where !== '--remote') throw new Error('usage: bun scripts/sweep-part-roles.ts --local|--remote')
const read = <Row>(query: string) => JSON.parse(executeD1(where, '--json', '--command', query))[0].results as Row[]
const LIVE = "FROM claims c JOIN entries e ON e.id = c.entry_id WHERE c.kind = 'composition' AND e.merged_into IS NULL AND e.hidden_at IS NULL"
const CHANGED = 'SELECT COALESCE(MAX(id), 0) FROM revisions WHERE entry_id ='

type HeldRow = { entry_id: number; part: string; role: string; func: string; change: number }
type ClaimRow = { entry_id: number; value: string; data: string | null; change: number }

const held = read<HeldRow>(`SELECT entry_id, part, role, func, (${CHANGED} entry_part_roles.entry_id) AS change FROM entry_part_roles`)
const compositions = read<ClaimRow>(`SELECT c.entry_id, c.value, c.data, (${CHANGED} c.entry_id) AS change ${LIVE}`)
const literal = (text: string) => `CAST(X'${Buffer.from(text).toString('hex')}' AS TEXT)`
const sig = (entry: number, part: string, role: string, func: string) => `${entry}\0${part}\0${role}\0${func}`

const have = new Set(held.map(row => sig(row.entry_id, row.part, row.role, row.func)))
const want = new Set<string>()
const updates: string[] = []

for (const row of compositions) {
  let payload: Record<string, unknown> = {}
  if (row.data) {
    try { payload = JSON.parse(row.data) } catch { continue }
  }
  const parsed = parseComposition(JSON.stringify({ ...payload, ids: row.value }))
  for (const item of partRoleRowsOf(row.value, parsed)) {
    const key = sig(row.entry_id, item.part, item.role, item.func)
    if (want.has(key)) continue
    want.add(key)
    if (!have.has(key)) {
      updates.push(
        `INSERT OR IGNORE INTO entry_part_roles(part, entry_id, role, func) ` +
        `SELECT ${literal(item.part)}, ${row.entry_id}, ${literal(item.role)}, ${literal(item.func)} ` +
        `WHERE EXISTS (SELECT 1 ${LIVE} AND e.id = ${row.entry_id}) AND (${CHANGED} ${row.entry_id}) = ${row.change};`,
      )
    }
  }
}

for (const row of held) {
  if (!want.has(sig(row.entry_id, row.part, row.role, row.func))) {
    updates.push(
      `DELETE FROM entry_part_roles WHERE part = ${literal(row.part)} AND entry_id = ${row.entry_id} ` +
      `AND role = ${literal(row.role)} AND func = ${literal(row.func)} AND (${CHANGED} ${row.entry_id}) = ${row.change};`,
    )
  }
}

if (updates.length) importD1(where, updates.join('\n'))
console.log(`${compositions.length} compositions checked, ${updates.length} part-role rows corrected.`)
