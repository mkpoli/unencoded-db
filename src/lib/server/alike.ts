// The forms several records have, and the pairs among those records that no one has decided about yet. A pair
// is decided when the records are merged, or when a relation claim of one names the other.
import { codedRecord } from '$lib/code'
import { formOf } from '$lib/forms'
import { plain } from '$lib/similar'
import { tilesOf, type Tile } from './entries'

export const ALIKE_PAGE = 30
/** Records read for one form at most, the earliest first. */
export const ALIKE_MAX = 12

export type AlikeCursor = { latest: number; id: number }
export type AlikeRecord = Tile & { script: string; script_other: string | null; with: number | null }
/** `same` when two of the records state the very same description. */
export type AlikeGroup = { id: number; ids: string[]; same: boolean; records: AlikeRecord[] }

export function parseAlikeCursor(text: string): AlikeCursor | null {
  const [, latest, id] = /^([1-9]\d{0,14})\.([1-9]\d{0,14})$/.exec(text) ?? []
  return latest ? { latest: Number(latest), id: Number(id) } : null
}

export const formsStatement = (db: D1Database, after: AlikeCursor | null) => db.prepare(`SELECT id, form, latest FROM form_counts INDEXED BY form_counts_alike WHERE n > 1 AND (latest, id) < (?, ?) ORDER BY latest DESC, id DESC LIMIT ${ALIKE_PAGE + 1}`)
  .bind(after?.latest ?? Number.MAX_SAFE_INTEGER, after?.id ?? 0)

export const membersStatement = (db: D1Database, forms: readonly string[]) => db.prepare(`SELECT f.form, f.entry_id, e.script, e.script_other
  FROM json_each(?) j CROSS JOIN forms f ON f.form = j.value AND f.entry_id IN (SELECT entry_id FROM forms WHERE form = j.value ORDER BY entry_id LIMIT ${ALIKE_MAX})
  CROSS JOIN entries e ON e.id = f.entry_id`).bind(JSON.stringify(forms))

export const statedStatement = (db: D1Database, records: readonly number[]) => db.prepare(`SELECT c.entry_id, c.kind, c.value
  FROM json_each(?) j CROSS JOIN claims c ON c.entry_id = j.value WHERE +c.kind = 'ids' OR (+c.kind = 'relation' AND c.value LIKE 'R+%')`).bind(JSON.stringify(records))

type Member = { form: string; entry_id: number; script: string; script_other: string | null }
type Stated = { entry_id: number; kind: 'ids' | 'relation'; value: string }

/** The forms with an undecided pair among one page of forms, the one with the latest record first. */
export async function alikePage(db: D1Database, after: AlikeCursor | null = null): Promise<{ groups: AlikeGroup[]; next: string | null }> {
  const { results: forms } = await formsStatement(db, after).all<{ id: number; form: string; latest: number }>()
  const more = forms.length > ALIKE_PAGE, page = forms.slice(0, ALIKE_PAGE), last = page.at(-1)
  if (!last) return { groups: [], next: null }
  const { results: members } = await membersStatement(db, page.map(row => row.form)).all<Member>()
  const ids = [...new Set(members.map(member => member.entry_id))]
  const [{ results: stated }, tiles] = await Promise.all([statedStatement(db, ids).all<Stated>(), tilesOf(db, ids)])
  const descriptions = new Map<number, string[]>(), decided = new Set<string>()
  const pair = (a: number, b: number) => `${Math.min(a, b)}.${Math.max(a, b)}`
  for (const { entry_id, kind, value } of stated) {
    const other = kind === 'relation' ? codedRecord(value) : null
    if (other) decided.add(pair(entry_id, other))
    if (kind === 'ids') descriptions.set(entry_id, [...(descriptions.get(entry_id) ?? []), plain(value)])
  }
  const groups = page.flatMap(({ id, form }): AlikeGroup[] => {
    const here = members.filter(member => member.form === form && tiles.has(member.entry_id)).sort((a, b) => a.entry_id - b.entry_id)
    const open = (a: Member, b: Member) => a !== b && !decided.has(pair(a.entry_id, b.entry_id))
    const shown = here.filter(member => here.some(other => open(member, other)))
    if (shown.length < 2) return []
    const own = (member: Member) => (descriptions.get(member.entry_id) ?? []).filter(ids => formOf(ids) === form)
    return [{
      id, ids: [...new Set(shown.flatMap(own))],
      same: shown.some(a => shown.some(b => open(a, b) && own(a).some(ids => own(b).includes(ids)))),
      // Each record is compared with the earliest one it is undecided with.
      records: shown.map(member => ({ ...tiles.get(member.entry_id)!, script: member.script, script_other: member.script_other, with: shown.find(other => other.entry_id < member.entry_id && open(member, other))?.entry_id ?? null })),
    }]
  })
  return { groups, next: more ? `${last.latest}.${last.id}` : null }
}
