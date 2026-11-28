// The forms several records have, and the pairs among those records that no one has decided about yet. A pair
// is decided when the records are merged, or when a relation claim of one names the other.
import { codedRecord } from '$lib/code'
import { formOf } from '$lib/forms'
import { plain } from '$lib/similar'
import { tagLookup, type Names } from '$lib/tags'
import { tilesOf, type Tile } from './entries'
import { tagList } from './tags'

export const ALIKE_PAGE = 30
/** Records read for one form at most, the earliest first, and undecided pairs shown of them. */
export const ALIKE_MAX = 50
export const PAIRS_MAX = 12

export type AlikeCursor = { latest: number; id: number }
export type AlikeScript = { name: string; label: string; names: Names }
export type AlikeRecord = Tile & { scripts: AlikeScript[] }
/** The undecided pairs of a form, earlier record first, and the records in them. `same` when a pair states the very same description. */
export type AlikeGroup = { id: number; ids: string[]; same: boolean; records: AlikeRecord[]; pairs: [number, number][] }

export function parseAlikeCursor(text: string): AlikeCursor | null {
  const [, latest, id] = /^([1-9]\d{0,14})\.([1-9]\d{0,14})$/.exec(text) ?? []
  return latest ? { latest: Number(latest), id: Number(id) } : null
}

export const formsStatement = (db: D1Database, after: AlikeCursor | null) => db.prepare(`SELECT id, form, latest FROM form_counts INDEXED BY form_counts_alike WHERE n > 1 AND (latest, id) < (?, ?) ORDER BY latest DESC, id DESC LIMIT ${ALIKE_PAGE + 1}`)
  .bind(after?.latest ?? Number.MAX_SAFE_INTEGER, after?.id ?? 0)

export const membersStatement = (db: D1Database, forms: readonly string[]) => db.prepare(`SELECT f.form, f.entry_id
  FROM json_each(?) j CROSS JOIN forms f ON f.form = j.value AND f.entry_id IN (SELECT entry_id FROM forms WHERE form = j.value ORDER BY entry_id LIMIT ${ALIKE_MAX})`).bind(JSON.stringify(forms))

export const statedStatement = (db: D1Database, records: readonly number[]) => db.prepare(`SELECT c.entry_id, c.kind, c.value
  FROM json_each(?) j CROSS JOIN claims c ON c.entry_id = j.value WHERE +c.kind = 'ids' OR +c.kind = 'tag' OR (+c.kind = 'relation' AND c.value LIKE 'R+%')`).bind(JSON.stringify(records))

type Member = { form: string; entry_id: number }
type Stated = { entry_id: number; kind: 'ids' | 'relation' | 'tag'; value: string }

/** The forms with an undecided pair among one page of forms, the one with the latest record first. */
export async function alikePage(db: D1Database, after: AlikeCursor | null = null): Promise<{ groups: AlikeGroup[]; next: string | null }> {
  const { results: forms } = await formsStatement(db, after).all<{ id: number; form: string; latest: number }>()
  const more = forms.length > ALIKE_PAGE, page = forms.slice(0, ALIKE_PAGE), last = page.at(-1)
  if (!last) return { groups: [], next: null }
  const { results: members } = await membersStatement(db, page.map(row => row.form)).all<Member>()
  const ids = [...new Set(members.map(member => member.entry_id))]
  const [{ results: stated }, tiles, tags] = await Promise.all([statedStatement(db, ids).all<Stated>(), tilesOf(db, ids), tagList(db)])
  const byTag = tagLookup(tags)
  const descriptions = new Map<number, string[]>(), scriptsOf = new Map<number, AlikeScript[]>(), decided = new Set<string>()
  const pair = (a: number, b: number) => `${Math.min(a, b)}.${Math.max(a, b)}`
  for (const { entry_id, kind, value } of stated) {
    const other = kind === 'relation' ? codedRecord(value) : null
    if (other) decided.add(pair(entry_id, other))
    if (kind === 'ids') descriptions.set(entry_id, [...(descriptions.get(entry_id) ?? []), plain(value)])
    if (kind === 'tag') {
      const tag = byTag.get(value)
      if (tag?.type === 'script') {
        const current = scriptsOf.get(entry_id) ?? []
        if (!current.some(item => item.name === tag.name)) scriptsOf.set(entry_id, [...current, { name: tag.name, label: tag.label, names: tag.names }])
      }
    }
  }
  const groups = page.flatMap(({ id, form }): AlikeGroup[] => {
    const here = members.filter(member => member.form === form && tiles.has(member.entry_id)).sort((a, b) => a.entry_id - b.entry_id)
    const pairs = here.flatMap((a, index) => here.slice(index + 1).filter(b => !decided.has(pair(a.entry_id, b.entry_id))).map(b => [a, b] as const)).slice(0, PAIRS_MAX)
    if (!pairs.length) return []
    const shown = here.filter(member => pairs.some(both => both.includes(member)))
    const own = (member: Member) => (descriptions.get(member.entry_id) ?? []).filter(ids => formOf(ids) === form)
    return [{
      id, ids: [...new Set(shown.flatMap(own))],
      same: pairs.some(([a, b]) => own(a).some(ids => own(b).includes(ids))),
      records: shown.map(member => ({ ...tiles.get(member.entry_id)!, scripts: scriptsOf.get(member.entry_id) ?? [] })),
      pairs: pairs.map(([a, b]) => [a.entry_id, b.entry_id]),
    }]
  })
  return { groups, next: more ? `${last.latest}.${last.id}` : null }
}
