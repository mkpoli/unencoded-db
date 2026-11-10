// The store of records: an entry is a character, a sighting is one place it was seen, and every state of
// either is a row in `revisions`. Each list reads one range of `entry_tags`, so its cost does not grow with
// the table, and a record is in a list only while it holds that list's tag.
import { CONTEXTS, isScript, isStatus, NEEDS, parseSightingTypes, SIGHTING_TYPES, STATUSES, STYLES, type Need, type SightingType } from '$lib/scripts'
import { cleanIds } from '$lib/ids'
import { isDescription } from 'ids-input'
import { referenceComplete } from '$lib/readiness'
import { parseRelatedCharacters, RELATION_KINDS, type RelatedDraft } from '$lib/related'

export type EntryFields = { script: string; script_other: string | null; ids: string | null; description: string | null; status: string; encoded_as: string | null; related: string | null; related_characters: string | null; reading: string | null; meaning: string | null; radical: string | null; strokes: number | null }
export type SightingFields = { place: string; url: string | null; title: string | null; author: string | null; publisher: string | null; report_date: string | null; original_date: string | null; page: string | null; context: string | null; style: string | null; types: string | null; note: string | null }
export type StoredImage = { image_key: string; image_type: string; image_w: number; image_h: number; thumb_key: string; box: string | null }
export type Entry = EntryFields & { id: number; rev: number; cover_key: string | null; cover_place: string | null; sightings: number; merged_into: number | null; hidden_at: string | null; created_by: string; created_at: string; updated_at: string }
export type Sighting = SightingFields & Partial<StoredImage> & { id: number; entry_id: number; first_entry: number; rev: number; hidden_at: string | null; created_by: string; created_at: string; updated_at: string; by_id?: string; by_name?: string }

export const ENTRY_FIELDS = ['script', 'script_other', 'ids', 'description', 'status', 'encoded_as', 'related', 'related_characters', 'reading', 'meaning', 'radical', 'strokes'] as const
export const SIGHTING_FIELDS = ['place', 'url', 'title', 'author', 'publisher', 'report_date', 'original_date', 'page', 'context', 'style', 'types', 'note'] as const
const IMAGE_FIELDS = ['image_key', 'image_type', 'image_w', 'image_h', 'thumb_key', 'box'] as const

const text = (form: FormData, name: string, max: number) => {
  const value = String(form.get(name) ?? '').normalize('NFC').trim()
  return value ? value.slice(0, max) : null
}
const oneOf = (value: string | null, allowed: readonly string[]) => (value && allowed.includes(value) ? value : null)
const now = () => new Date().toISOString()

const relatedNames = ['related_character', 'related_relationship', 'related_difference', 'related_evidence'] as const

export function validRelatedFields(form: FormData): boolean {
  if (!form.has('related_characters_present')) return true
  const columns = relatedNames.map(name => form.getAll(name))
  if (columns[0].length > 50 || columns.some(column => column.length !== columns[0].length || column.some(value => typeof value !== 'string'))) return false
  return columns[0].every((character, i) => {
    const normalized = String(character).normalize('NFC').trim()
    const relationship = String(columns[1][i])
    return normalized.length > 0 && normalized.length <= 80 && (RELATION_KINDS as readonly string[]).includes(relationship)
      && String(columns[2][i]).normalize('NFC').trim().length <= 5000 && String(columns[3][i]).normalize('NFC').trim().length <= 5000
  })
}

export function readEntryFields(form: FormData, base?: Partial<EntryFields>): EntryFields {
  const script = text(form, 'script', 20)
  const status = text(form, 'status', 20)
  const ids = cleanIds(String(form.get('ids') ?? '')).slice(0, 200) || null
  const strokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
  const field = (name: keyof EntryFields, max: number) => form.has(name) ? text(form, name, max) : (base?.[name] as string | null) ?? null
  const characters = form.getAll('related_character')
  const relationships = form.getAll('related_relationship')
  const differences = form.getAll('related_difference')
  const evidence = form.getAll('related_evidence')
  const valid = validRelatedFields(form)
  const clean = (value: FormDataEntryValue | undefined) => valid ? String(value ?? '').normalize('NFC').trim() : String(value ?? '')
  const count = Math.max(characters.length, relationships.length, differences.length, evidence.length)
  const comparisons = Array.from({ length: count }, (_, i): RelatedDraft => ({
    character: clean(characters[i]), relationship: String(relationships[i] ?? ''),
    difference: clean(differences[i]), evidence: clean(evidence[i]),
  }))
  return {
    script: isScript(script) ? script : base?.script ?? 'han',
    script_other: field('script_other', 80),
    ids: form.has('ids') ? ids : base?.ids ?? null,
    description: field('description', 20000),
    status: isStatus(status) ? status : base?.status ?? 'unchecked',
    encoded_as: field('encoded_as', 80),
    related: field('related', 200),
    related_characters: form.has('related_characters_present') ? (comparisons.length ? JSON.stringify(comparisons) : null) : base?.related_characters ?? null,
    reading: field('reading', 200),
    meaning: field('meaning', 500),
    radical: field('radical', 20),
    strokes: form.has('strokes') ? (Number.isInteger(strokes) && strokes >= 0 && strokes < 200 ? strokes : null) : base?.strokes ?? null,
  }
}

export function readSightingFields(form: FormData): SightingFields {
  const url = text(form, 'url', 1000)
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : null
  const chosen = new Set(form.getAll('types').map(String))
  const types = SIGHTING_TYPES.filter(type => chosen.has(type))
  return {
    // A link alone answers where it was found.
    place: text(form, 'place', 500) ?? safeUrl ?? '',
    url: safeUrl,
    title: text(form, 'title', 300),
    author: text(form, 'author', 300),
    publisher: text(form, 'publisher', 300),
    report_date: text(form, 'report_date', 40),
    original_date: text(form, 'original_date', 40),
    page: text(form, 'page', 80),
    context: oneOf(text(form, 'context', 20), CONTEXTS),
    style: oneOf(text(form, 'style', 20), STYLES),
    types: types.length ? JSON.stringify(types) : null,
    note: text(form, 'note', 5000),
  }
}

export function readBox(raw: unknown, width: number, height: number) {
  try {
    const box = JSON.parse(String(raw))
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null
    const x = Math.max(0, Math.round(box[0])), y = Math.max(0, Math.round(box[1]))
    const w = Math.min(width - x, Math.round(box[2])), h = Math.min(height - y, Math.round(box[3]))
    return w >= 4 && h >= 4 ? JSON.stringify([x, y, w, h]) : null
  } catch { return null }
}

// ---------- The tags a record holds ----------

const WORD = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Hangul}\p{N}]+|[^\s\p{P}\p{S}\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Hangul}\p{N}]|[⿰-⿿]/gu
const WORDS_MAX = 400
export const SEARCH_TERMS_MAX = 5
export const SEARCH_LENGTH_MAX = 200

// Letters are words and every other character is a term of its own, which finds a part inside a description
// sequence and needs no word breaking for CJK text.
export function terms(value: string) {
  return (value.normalize('NFKC').toLowerCase().match(WORD) ?? []).filter(term => !/^[⿰-⿿]$/.test(term))
}

type TagInput = Pick<Entry, 'script' | 'status' | 'ids' | 'cover_key' | 'description' | 'encoded_as' | 'related' | 'related_characters' | 'reading' | 'meaning' | 'script_other'>
export function facetTags(entry: Pick<TagInput, 'script' | 'status' | 'ids' | 'cover_key'>, hasSource: boolean) {
  const filters = [`f:${entry.status}`]
  if (!entry.cover_key) filters.push('n:image')
  if (!entry.ids) filters.push('n:ids')
  if (!hasSource) filters.push('n:source')
  return ['all', `s:${entry.script}`, ...filters, ...filters.map(filter => `s:${entry.script}|${filter}`)]
}

function wordTags(entry: TagInput, sightings: SightingFields[]) {
  const words = new Set<string>()
  const add = (value: string | null | undefined) => { for (const term of terms(value ?? '')) words.add(term) }
  for (const field of ['ids', 'description', 'encoded_as', 'related', 'reading', 'meaning', 'script_other'] as const) add(entry[field])
  for (const sighting of sightings) for (const field of ['place', 'title', 'author', 'publisher', 'note'] as const) add(sighting[field])
  for (const comparison of parseRelatedCharacters(entry.related_characters)) { add(comparison.character); add(comparison.difference); add(comparison.evidence) }
  return [...words].slice(0, WORDS_MAX).map(word => `w:${word}`)
}

// Brings a record's tags and the counts up to date, and its cover with them. It answers the statements, to run
// with the write they belong to.
async function reindex(db: D1Database, id: number, entry: Entry, sightings: (SightingFields & Partial<StoredImage> & { hidden_at?: string | null })[]) {
  const visible = sightings.filter(sighting => !sighting.hidden_at)
  const cover = visible.find(sighting => sighting.thumb_key)
  const coverKey = cover?.thumb_key ?? null
  const coverPlace = (cover ?? visible[0])?.place ?? null
  const live = !entry.merged_into && !entry.hidden_at
  const hasSource = visible.some(sighting => referenceComplete({ ...sighting, image_key: null, box: null }))
  const next = live ? [...facetTags({ ...entry, cover_key: coverKey }, hasSource), ...wordTags(entry, visible)] : []
  const { results } = await db.prepare('SELECT tag FROM entry_tags WHERE entry_id = ?').bind(id).all<{ tag: string }>()
  const current = new Set(results.map(row => row.tag)), wanted = new Set(next)
  const gone = [...current].filter(tag => !wanted.has(tag)), added = next.filter(tag => !current.has(tag))
  const facet = (tag: string) => !tag.startsWith('w:')
  return [
    db.prepare('UPDATE entries SET cover_key = ?, cover_place = ?, sightings = ? WHERE id = ?').bind(coverKey, coverPlace, visible.length, id),
    db.prepare('DELETE FROM entry_tags WHERE entry_id = ? AND tag IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(gone)),
    db.prepare('INSERT OR IGNORE INTO entry_tags(tag, entry_id) SELECT value, ? FROM json_each(?)').bind(id, JSON.stringify(added)),
    db.prepare('UPDATE tag_counts SET n = n - 1 WHERE tag IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gone.filter(facet))),
    db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(added.filter(facet))),
  ]
}

const snapshotOf = <T extends object>(row: T, fields: readonly (keyof T)[]) => JSON.stringify(Object.fromEntries(fields.map(field => [field, row[field] ?? null])))
const sightingSnapshot = (row: SightingFields & Partial<StoredImage>) => snapshotOf(row as Record<string, unknown>, [...SIGHTING_FIELDS, ...IMAGE_FIELDS])

type Who = { actor: string; ip: string | null }
function revision(db: D1Database, who: Who, row: { entry: number; sighting?: number | null; kind: string; rev: number; snapshot: string; summary?: string | null }) {
  return db.prepare('INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at, ip_hash) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(row.entry, row.sighting ?? null, row.kind, row.rev, row.snapshot, row.summary ?? null, who.actor, now(), who.ip)
}

// ---------- Writes ----------

function insertSighting(db: D1Database, entry: number, fields: SightingFields, image: StoredImage | null, actor: string, at: string) {
  const columns = [...SIGHTING_FIELDS, ...IMAGE_FIELDS]
  const values = [...SIGHTING_FIELDS.map(field => fields[field]), ...IMAGE_FIELDS.map(field => image?.[field] ?? null)]
  return db.prepare(`INSERT INTO sightings(entry_id, first_entry, ${columns.join(', ')}, created_by, created_at, updated_at) VALUES(?, ?, ${columns.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`)
    .bind(entry, entry, ...values, actor, at, at)
}

export async function createEntry(db: D1Database, fields: EntryFields, sighting: SightingFields, image: StoredImage | null, who: Who) {
  const at = now()
  const columns = ENTRY_FIELDS.join(', ')
  // AUTOINCREMENT sequences are read inside the same transaction as the inserts.
  const entryId = "(SELECT seq FROM sqlite_sequence WHERE name = 'entries')"
  const sightingId = "(SELECT seq FROM sqlite_sequence WHERE name = 'sightings')"
  const sightingColumns = [...SIGHTING_FIELDS, ...IMAGE_FIELDS]
  const tags = [...facetTags({ ...fields, cover_key: image?.thumb_key ?? null }, referenceComplete({ ...sighting, image_key: null, box: null })), ...wordTags({ ...fields, cover_key: image?.thumb_key ?? null }, [sighting])]
  const facet = tags.filter(tag => !tag.startsWith('w:'))
  const results = await db.batch<{ id: number }>([
    db.prepare(`INSERT INTO entries(${columns}, created_by, created_at, updated_at) VALUES(${ENTRY_FIELDS.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`)
      .bind(...ENTRY_FIELDS.map(field => fields[field]), who.actor, at, at),
    db.prepare(`INSERT INTO sightings(entry_id, first_entry, ${sightingColumns.join(', ')}, created_by, created_at, updated_at) VALUES(${entryId}, ${entryId}, ${sightingColumns.map(() => '?').join(', ')}, ?, ?, ?)`)
      .bind(...SIGHTING_FIELDS.map(field => sighting[field]), ...IMAGE_FIELDS.map(field => image?.[field] ?? null), who.actor, at, at),
    db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${entryId}, 'create', 1, ?, ?, ?, ?)`)
      .bind(snapshotOf(fields, ENTRY_FIELDS), who.actor, at, who.ip),
    db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${entryId}, ${sightingId}, 'sighting', 1, ?, ?, ?, ?)`)
      .bind(sightingSnapshot({ ...sighting, ...image }), who.actor, at, who.ip),
    db.prepare(`UPDATE entries SET cover_key = ?, cover_place = ?, sightings = 1 WHERE id = ${entryId}`).bind(image?.thumb_key ?? null, sighting.place),
    db.prepare(`INSERT INTO entry_tags(tag, entry_id) SELECT value, ${entryId} FROM json_each(?)`).bind(JSON.stringify(tags)),
    db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(facet)),
  ])
  return results[0].results[0].id
}

export type EditResult = { ok: true; rev: number } | { ok: false; code: 'missing' | 'conflict' | 'merged' }

const revisionMark = async (db: D1Database, id: number) => (await db.prepare('SELECT COALESCE(MAX(id), 0) AS mark FROM revisions WHERE entry_id = ?').bind(id).first<{ mark: number }>())!.mark
const checkMark = (db: D1Database, id: number, mark: number, who: Who) => db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, 'conflict', 0, '{}', ?, ? WHERE (SELECT COALESCE(MAX(id), 0) FROM revisions WHERE entry_id = ?) != ?`).bind(id, who.actor, now(), id, mark)

export async function editEntry(db: D1Database, id: number, baseRev: number, fields: EntryFields, who: Who, summary: string | null, kind: 'edit' | 'revert' = 'edit'): Promise<EditResult> {
  return editEntryAttempt(db, id, baseRev, fields, who, summary, kind, 0)
}

async function editEntryAttempt(db: D1Database, id: number, baseRev: number, fields: EntryFields, who: Who, summary: string | null, kind: 'edit' | 'revert', attempt: number): Promise<EditResult> {
  const mark = await revisionMark(db, id)
  const entry = await getEntryRow(db, id)
  if (!entry || entry.hidden_at) return { ok: false, code: 'missing' }
  if (entry.merged_into) return { ok: false, code: 'merged' }
  if (entry.rev !== baseRev) return { ok: false, code: 'conflict' }
  const rev = entry.rev + 1
  const set = ENTRY_FIELDS.map(field => `${field} = ?`).join(', ')
  const sightings = await sightingRows(db, id)
  const index = await reindex(db, id, { ...entry, ...fields, rev }, sightings)
  try {
    await db.batch([
      checkMark(db, id, mark, who),
      db.prepare(`UPDATE entries SET ${set}, rev = ?, updated_at = ? WHERE id = ? AND rev = ? AND merged_into IS NULL`)
        .bind(...ENTRY_FIELDS.map(field => fields[field]), rev, now(), id, baseRev),
      // Abort the entire batch when a concurrent writer won the revision.
      db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, 'conflict', 0, '{}', ?, ? WHERE changes() = 0`).bind(id, who.actor, now()),
      revision(db, who, { entry: id, kind, rev, snapshot: snapshotOf(fields, ENTRY_FIELDS), summary }),
      ...index,
    ])
  } catch (error) {
    const latest = await getEntryRow(db, id)
    if (!latest) return { ok: false, code: 'missing' }
    if (latest.merged_into) return { ok: false, code: 'merged' }
    if (latest.rev !== baseRev) return { ok: false, code: 'conflict' }
    if (await revisionMark(db, id) !== mark && attempt < 4) return editEntryAttempt(db, id, baseRev, fields, who, summary, kind, attempt + 1)
    throw error
  }
  return { ok: true, rev }
}

export class SightingLimitError extends Error {
  constructor() {
    super('This entry has reached the 200-sighting limit.')
    this.name = 'SightingLimitError'
  }
}

export async function addSighting(db: D1Database, id: number, fields: SightingFields, image: StoredImage | null, who: Who) {
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, id)
    const entry = await getEntryRow(db, id)
    if (!entry || entry.hidden_at || entry.merged_into) return null
    const sightings = await sightingRows(db, id)
    if (sightings.length >= SIGHTINGS_MAX) throw new SightingLimitError()
    const next = [...sightings, { ...fields, ...image }]
    const index = await reindex(db, id, entry, next)
    const at = now()
    try {
      const results = await db.batch<{ id: number }>([
        checkMark(db, id, mark, who),
        db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, 'conflict', 0, '{}', ?, ? WHERE EXISTS (SELECT 1 FROM sightings WHERE entry_id = ? LIMIT 1 OFFSET ${SIGHTINGS_MAX - 1})`).bind(id, who.actor, at, id),
        insertSighting(db, id, fields, image, who.actor, at),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(at, id),
        db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(?, (SELECT seq FROM sqlite_sequence WHERE name = 'sightings'), 'sighting', 1, ?, ?, ?, ?)`)
          .bind(id, sightingSnapshot({ ...fields, ...image }), who.actor, at, who.ip),
        ...index,
      ])
      return results[2].results[0].id
    } catch (error) {
      if (attempt < 4 && await revisionMark(db, id) !== mark) continue
      if ((await sightingRows(db, id)).length >= SIGHTINGS_MAX) throw new SightingLimitError()
      throw error
    }
  }
}

export async function editSighting(db: D1Database, id: number, baseRev: number, fields: SightingFields, image: StoredImage | null | 'remove', who: Who, summary: string | null, expectedEntry: number): Promise<EditResult> {
  return writeSighting(db, id, baseRev, fields, image, who, summary, expectedEntry)
}

export async function restoreSighting(db: D1Database, entryId: number, sightingId: number, baseRev: number, fields: SightingFields, who: Who, sourceRev: number): Promise<EditResult> {
  return writeSighting(db, sightingId, baseRev, fields, null, who, `r${sourceRev}`, entryId)
}

async function writeSighting(db: D1Database, id: number, baseRev: number, fields: SightingFields, image: StoredImage | null | 'remove', who: Who, summary: string | null, expectedEntry: number): Promise<EditResult> {
  for (let attempt = 0; ; attempt++) {
    const initial = await getSighting(db, id)
    if (!initial || initial.entry_id !== expectedEntry) return { ok: false, code: 'missing' }
    const mark = await revisionMark(db, initial.entry_id)
    const current = await getSighting(db, id)
    if (!current) return { ok: false, code: 'missing' }
    if (current.entry_id !== initial.entry_id) {
      if (attempt < 4) continue
      return { ok: false, code: 'conflict' }
    }
    if (current.rev !== baseRev) return { ok: false, code: 'conflict' }
    const entry = await getEntryRow(db, current.entry_id)
    if (!entry || entry.hidden_at || current.hidden_at) return { ok: false, code: 'missing' }
    if (entry.merged_into) return { ok: false, code: 'merged' }
    const sightings = await sightingRows(db, current.entry_id)
    const rev = current.rev + 1
    const kept = Object.fromEntries(IMAGE_FIELDS.map(field => [field, image === 'remove' ? null : image ? image[field] : current[field] ?? null])) as unknown as StoredImage
    const columns = [...SIGHTING_FIELDS, ...IMAGE_FIELDS]
    const index = await reindex(db, current.entry_id, entry, sightings.map(s => s.id === id ? { ...s, ...fields, ...kept } : s))
    try {
      await db.batch([
        checkMark(db, current.entry_id, mark, who),
        db.prepare(`UPDATE sightings SET ${columns.map(column => `${column} = ?`).join(', ')}, rev = ?, updated_at = ? WHERE id = ? AND entry_id = ? AND rev = ? AND hidden_at IS NULL AND EXISTS (SELECT 1 FROM entries WHERE id = sightings.entry_id AND hidden_at IS NULL AND merged_into IS NULL)`)
          .bind(...SIGHTING_FIELDS.map(field => fields[field]), ...IMAGE_FIELDS.map(field => kept[field]), rev, now(), id, current.entry_id, baseRev),
        db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, 'conflict', 0, '{}', ?, ? WHERE changes() = 0`).bind(current.entry_id, who.actor, now()),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(now(), current.entry_id),
        revision(db, who, { entry: current.entry_id, sighting: id, kind: 'sighting_edit', rev, snapshot: sightingSnapshot({ ...fields, ...kept }), summary }),
        ...index,
      ])
      return { ok: true, rev }
    } catch (error) {
      const latest = await getSighting(db, id)
      if (!latest || latest.entry_id !== expectedEntry || latest.hidden_at) return { ok: false, code: 'missing' }
      const latestEntry = await getEntryRow(db, expectedEntry)
      if (!latestEntry || latestEntry.hidden_at) return { ok: false, code: 'missing' }
      if (latestEntry.merged_into) return { ok: false, code: 'merged' }
      if (latest.rev !== baseRev) return { ok: false, code: 'conflict' }
      if (attempt < 4 && await revisionMark(db, current.entry_id) !== mark) continue
      throw error
    }
  }
}

// Any revision of a record's fields can be made current again; the journal gains a row and loses none.
export async function revertEntry(db: D1Database, id: number, revisionId: number, who: Who) {
  const old = await db.prepare(`SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND kind IN ('create','edit','revert')`).bind(revisionId, id).first<{ snapshot: string; rev: number }>()
  const entry = await getEntryRow(db, id)
  if (!old || !entry) return { ok: false as const, code: 'missing' as const }
  const fields = JSON.parse(old.snapshot) as EntryFields
  fields.related_characters ??= null
  return editEntry(db, id, entry.rev, fields, who, `r${old.rev}`, 'revert')
}

export async function mergeEntry(db: D1Database, from: number, into: number, who: Who, summary: string | null) {
  if (from === into) return { ok: false as const, code: 'self' as const }
  const source = await getEntryRow(db, from), target = await getEntryRow(db, into)
  if (!source || !target || target.merged_into || target.hidden_at) return { ok: false as const, code: 'missing' as const }
  if (source.merged_into) return { ok: false as const, code: 'merged' as const }
  await db.batch([
    db.prepare('UPDATE sightings SET entry_id = ? WHERE entry_id = ?').bind(into, from),
    db.prepare('UPDATE entries SET merged_into = ?, updated_at = ? WHERE id = ?').bind(into, now(), from),
    revision(db, who, { entry: from, kind: 'merge', rev: source.rev, snapshot: JSON.stringify({ into }), summary }),
    revision(db, who, { entry: into, kind: 'merge', rev: target.rev, snapshot: JSON.stringify({ from }), summary }),
  ])
  await refresh(db, from)
  await refresh(db, into)
  return { ok: true as const }
}

export async function unmergeEntry(db: D1Database, id: number, who: Who) {
  const entry = await getEntryRow(db, id)
  if (!entry?.merged_into) return false
  const into = entry.merged_into
  await db.batch([
    // What was merged into this record before it was merged comes back with it.
    db.prepare('UPDATE sightings SET entry_id = ? WHERE entry_id = ? AND (first_entry = ? OR first_entry IN (SELECT id FROM entries WHERE merged_into = ?))').bind(id, into, id, id),
    db.prepare('UPDATE entries SET merged_into = NULL, updated_at = ? WHERE id = ?').bind(now(), id),
    revision(db, who, { entry: id, kind: 'unmerge', rev: entry.rev, snapshot: JSON.stringify({ from: into }) }),
    revision(db, who, { entry: into, kind: 'unmerge', rev: 0, snapshot: JSON.stringify({ from: id }) }),
  ])
  await refresh(db, id)
  await refresh(db, into)
  return true
}

export async function setHidden(db: D1Database, target: { entry: number; sighting?: number | null }, hidden: boolean, who: Who, summary: string | null) {
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, target.entry)
    const entry = await getEntryRow(db, target.entry)
    if (!entry) return false
    const sightings = await sightingRows(db, target.entry)
    const sighting = target.sighting != null ? sightings.find(s => s.id === target.sighting) : null
    if (target.sighting != null && !sighting) return false
    if (Boolean(sighting ? sighting.hidden_at : entry.hidden_at) === hidden) return true
    const at = hidden ? now() : null
    const index = await reindex(db, target.entry,
      sighting ? entry : { ...entry, hidden_at: at },
      sighting ? sightings.map(s => s.id === sighting.id ? { ...s, hidden_at: at } : s) : sightings)
    const update = sighting
      ? db.prepare('UPDATE sightings SET hidden_at = ? WHERE id = ? AND entry_id = ?').bind(at, sighting.id, target.entry)
      : db.prepare('UPDATE entries SET hidden_at = ? WHERE id = ?').bind(at, target.entry)
    try {
      await db.batch([
        checkMark(db, target.entry, mark, who), update,
        db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, 'conflict', 0, '{}', ?, ? WHERE changes() = 0`).bind(target.entry, who.actor, now()),
        revision(db, who, { entry: target.entry, sighting: target.sighting, kind: hidden ? 'hide' : 'unhide', rev: 0, snapshot: '{}', summary }),
        ...index,
      ])
      return true
    } catch (error) {
      if (attempt < 4 && await revisionMark(db, target.entry) !== mark) continue
      throw error
    }
  }
}

async function refresh(db: D1Database, id: number) {
  const entry = await getEntryRow(db, id)
  if (entry) await db.batch(await reindex(db, id, entry, await sightingRows(db, id)))
}

export async function report(db: D1Database, target: { entry: number; sighting?: number | null }, reason: string, reporter: string) {
  await db.prepare('INSERT INTO reports(entry_id, sighting_id, reason, reporter, at) VALUES(?,?,?,?,?)').bind(target.entry, target.sighting ?? null, reason, reporter, now()).run()
}

export async function resolveReport(db: D1Database, id: number, by: string) {
  return Boolean(await db.prepare('UPDATE reports SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL RETURNING id').bind(now(), by, id).first())
}

// ---------- Reads ----------

export const SIGHTINGS_MAX = 200
const WHO = (column: string) => `LEFT JOIN people p ON p.id = ${column} LEFT JOIN people m ON m.id = p.merged_into`
const WHO_COLUMNS = 'COALESCE(m.id, p.id) AS by_id, COALESCE(m.name, p.name) AS by_name'

export const getEntryRow = (db: D1Database, id: number) => db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first<Entry>()
const sightingRows = async (db: D1Database, id: number) => (await db.prepare(`SELECT * FROM sightings WHERE entry_id = ? ORDER BY id LIMIT ${SIGHTINGS_MAX}`).bind(id).all<Sighting>()).results

export async function getEntry(db: D1Database, id: number) {
  const entry = await db.prepare(`SELECT e.*, ${WHO_COLUMNS} FROM entries e ${WHO('e.created_by')} WHERE e.id = ?`).bind(id).first<Entry & { by_id: string; by_name: string }>()
  if (!entry) return null
  const { results } = await db.prepare(`SELECT s.*, ${WHO_COLUMNS} FROM sightings s ${WHO('s.created_by')} WHERE s.entry_id = ? ORDER BY s.id LIMIT ${SIGHTINGS_MAX}`).bind(id).all<Sighting>()
  return { entry, sightings: results }
}

export const getSighting = (db: D1Database, id: number) => db.prepare('SELECT * FROM sightings WHERE id = ?').bind(id).first<Sighting>()

export type Listing = { script?: string | null; filter?: string | null; query?: string | null; before?: number | null; limit?: number }
export const PAGE = 48
export const SEARCH_WINDOW = 256

// The one key a script and a filter name, or null for a filter that is not one.
export function listTag(script?: string | null, filter?: string | null) {
  const f = !filter ? null : (STATUSES as readonly string[]).includes(filter) ? `f:${filter}` : (NEEDS as readonly string[]).includes(filter as Need) ? `n:${filter}` : undefined
  if (f === undefined || (script && !isScript(script))) return null
  return script && f ? `s:${script}|${f}` : script ? `s:${script}` : f ?? 'all'
}

export function exactSearchIds(query: string) {
  const ids = cleanIds(query)
  return isDescription(ids) ? ids : null
}

export function listStatement(db: D1Database, { script, filter, query, before, limit = PAGE }: Listing) {
  const tag = listTag(script, filter)
  if (!tag) return null
  if ((query?.trim().length ?? 0) > SEARCH_LENGTH_MAX) return null
  const exact = exactSearchIds(query ?? '')
  const words = exact ? [] : [...new Set(terms(query ?? ''))]
  if (!exact && (words.length > SEARCH_TERMS_MAX || (query?.trim() && !words.length))) return null
  // The facet range drives the query. Word tests are projections, not filters:
  // LIMIT therefore bounds candidates read even when no word matches.
  const matches = exact ? 'e.ids = ?' : words.map(() => 'EXISTS (SELECT 1 FROM entry_tags w WHERE w.tag = ? AND w.entry_id = t.entry_id)').join(' AND ') || '1'
  return db.prepare(`SELECT e.id, e.ids, e.cover_key, e.sightings, (${matches}) AS matches FROM entry_tags t CROSS JOIN entries e ON e.id = t.entry_id WHERE t.tag = ? AND t.entry_id < ? ORDER BY t.entry_id DESC LIMIT ?`)
    .bind(...(exact ? [exact] : words.map(word => `w:${word}`)), tag, before ?? Number.MAX_SAFE_INTEGER, (exact || words.length ? SEARCH_WINDOW : limit) + 1)
}

export type YearKind = 'report' | 'original'
export type Tile = Pick<Entry, 'id' | 'ids' | 'cover_key' | 'sightings'> & { types: SightingType[]; firstYear: string | null; firstYearKind: YearKind | null }

// A date is free text, so the first four- or three-digit run is read as the year and the rest is left alone.
function firstYear(value: string | null) {
  const match = value?.match(/\d{3,4}/)
  return match ? { text: match[0], n: Number(match[0]) } : null
}

// What the tiles show about the evidence: which source types the record has and the earliest year among
// them. An older work in a recent post dates the sighting, not the post.
async function summaries(db: D1Database, ids: number[]) {
  const out = new Map<number, { types: SightingType[]; firstYear: string | null; firstYearKind: YearKind | null }>()
  if (!ids.length) return out
  const { results } = await db.prepare(`SELECT entry_id, types, report_date, original_date FROM sightings WHERE entry_id IN (${ids.map(() => '?').join(', ')}) AND hidden_at IS NULL`).bind(...ids).all<{ entry_id: number; types: string | null; report_date: string | null; original_date: string | null }>()
  const types = new Map<number, Set<SightingType>>()
  const years = new Map<number, number>()
  for (const row of results) {
    const chosen = types.get(row.entry_id) ?? new Set<SightingType>()
    for (const type of parseSightingTypes(row.types)) chosen.add(type)
    types.set(row.entry_id, chosen)
    const report = firstYear(row.report_date), original = firstYear(row.original_date)
    const year = original && (!report || original.n <= report.n)
      ? { ...original, kind: 'original' as const }
      : report ? { ...report, kind: 'report' as const } : null
    if (year && (years.get(row.entry_id) === undefined || year.n < years.get(row.entry_id)!)) {
      years.set(row.entry_id, year.n)
      out.set(row.entry_id, { types: [], firstYear: year.text, firstYearKind: year.kind })
    }
  }
  for (const [id, chosen] of types) out.set(id, { types: SIGHTING_TYPES.filter(type => chosen.has(type)), firstYear: out.get(id)?.firstYear ?? null, firstYearKind: out.get(id)?.firstYearKind ?? null })
  return out
}

export async function list(db: D1Database, listing: Listing) {
  const statement = listStatement(db, listing)
  if (!statement) return null
  const limit = listing.limit ?? PAGE
  const { results } = await statement.all<(Omit<Tile, 'types' | 'firstYear' | 'firstYearKind'> & { matches: number })>()
  const searching = Boolean(exactSearchIds(listing.query ?? '')) || terms(listing.query ?? '').length > 0
  const window = searching ? SEARCH_WINDOW : limit
  const tiles: Tile[] = []
  let consumed = 0
  for (const { matches, ...tile } of results.slice(0, window)) {
    consumed++
    if (matches) tiles.push({ ...tile, types: [], firstYear: null, firstYearKind: null })
    if (tiles.length === limit) break
  }
  const found = await summaries(db, tiles.map(tile => tile.id))
  for (const tile of tiles) {
    const summary = found.get(tile.id)
    if (summary) { tile.types = summary.types; tile.firstYear = summary.firstYear; tile.firstYearKind = summary.firstYearKind }
  }
  const next = consumed < results.length ? results[consumed - 1].id : null
  return { tiles, next, partial: searching && next !== null && tiles.length < limit }
}

export async function counts(db: D1Database) {
  const { results } = await db.prepare(`SELECT tag, n FROM tag_counts WHERE n > 0 AND tag NOT LIKE '%|%'`).all<{ tag: string; n: number }>()
  return Object.fromEntries(results.map(row => [row.tag, row.n])) as Record<string, number>
}

export type Revision = { id: number; entry_id: number; sighting_id: number | null; kind: string; rev: number; snapshot: string; summary: string | null; at: string; by_id: string; by_name: string; cover_key?: string | null; ids?: string | null }

export const FEED = 60

export async function history(db: D1Database, entry: number, before?: number | null) {
  const { results } = await db.prepare(`SELECT r.id, r.entry_id, r.sighting_id, r.kind, r.rev, r.snapshot, r.summary, r.at, ${WHO_COLUMNS} FROM revisions r ${WHO('r.actor')} WHERE r.entry_id = ? AND r.id < ? ORDER BY r.id DESC LIMIT 501`).bind(entry, before ?? Number.MAX_SAFE_INTEGER).all<Revision>()
  return results
}

export function recentStatement(db: D1Database, before?: number | null) {
  // Range over at most FEED + 1 revisions, even when every target is private.
  return db.prepare(`SELECT r.id, r.entry_id, r.sighting_id, r.kind, r.rev, r.summary, r.at, '' AS snapshot, ${WHO_COLUMNS}, e.cover_key, e.ids, (e.hidden_at IS NULL AND e.merged_into IS NULL AND (r.sighting_id IS NULL OR (s.id IS NOT NULL AND s.hidden_at IS NULL))) AS visible FROM revisions r CROSS JOIN entries e ON e.id = r.entry_id LEFT JOIN sightings s ON s.id = r.sighting_id AND s.entry_id = r.entry_id ${WHO('r.actor')} WHERE r.id < ? ORDER BY r.id DESC LIMIT ?`)
    .bind(before ?? Number.MAX_SAFE_INTEGER, FEED + 1)
}

export async function recent(db: D1Database, before?: number | null) {
  const { results } = await recentStatement(db, before).all<Revision & { visible: number }>()
  const rows = results.slice(0, FEED).filter(row => row.visible).map(({ visible, ...row }) => row)
  return { rows, next: results.length > FEED ? results[FEED - 1].id : null }
}

export async function ofPerson(db: D1Database, id: string, before?: number | null) {
  const person = await db.prepare('SELECT id, name, atlas_sub, created_at, merged_into FROM people WHERE id = ?').bind(id).first<{ id: string; name: string; atlas_sub: string | null; created_at: string; merged_into: string | null }>()
  if (!person) return null
  const { results } = await db.prepare(`SELECT r.id, r.entry_id, r.sighting_id, r.kind, r.rev, r.summary, r.at, '' AS snapshot, ? AS by_id, ? AS by_name, e.cover_key, e.ids FROM revisions r JOIN entries e ON e.id = r.entry_id WHERE r.actor = ? AND r.id < ? ORDER BY r.id DESC LIMIT ?`)
    .bind(person.id, person.name, person.id, before ?? Number.MAX_SAFE_INTEGER, FEED + 1).all<Revision>()
  return { person, rows: results.slice(0, FEED), next: results.length > FEED ? results[FEED - 1].id : null }
}

export const REPORT_PAGE = 100

export async function openReports(db: D1Database, after = 0) {
  const { results } = await db.prepare(`SELECT x.id, x.entry_id, x.sighting_id, x.reason, x.at, ${WHO_COLUMNS}, e.cover_key, e.ids, e.hidden_at, CASE WHEN x.sighting_id IS NULL THEN e.hidden_at ELSE s.hidden_at END AS target_hidden_at FROM reports x ${WHO('x.reporter')} JOIN entries e ON e.id = x.entry_id LEFT JOIN sightings s ON s.id = x.sighting_id AND s.entry_id = x.entry_id WHERE x.resolved_at IS NULL AND x.id > ? ORDER BY x.id LIMIT ?`).bind(after, REPORT_PAGE + 1).all<{ id: number; entry_id: number; sighting_id: number | null; reason: string; at: string; by_id: string; by_name: string; cover_key: string | null; ids: string | null; hidden_at: string | null; target_hidden_at: string | null }>()
  return { reports: results.slice(0, REPORT_PAGE), next: results.length > REPORT_PAGE ? results[REPORT_PAGE - 1].id : null }
}

// A page counts evidence rows (or one row for an entry without evidence).
// Entries with many sightings continue with their metadata repeated.
export const EXPORT_PAGE_MAX = 200
const EXPORT_SIGHTING_COLUMNS = ['id', 'entry_id', 'first_entry', 'rev', ...SIGHTING_FIELDS, ...IMAGE_FIELDS, 'hidden_at', 'created_by', 'created_at', 'updated_at'] as const
const EXPORT_EVIDENCE = `CASE WHEN s.id IS NULL THEN NULL ELSE json_object(${EXPORT_SIGHTING_COLUMNS.map(column => `'${column}', s.${column}`).join(', ')}, 'by_id', COALESCE(m.id, p.id), 'by_name', COALESCE(m.name, p.name)) END AS evidence_json`
type ExportRow = Entry & { evidence_json: string | null }
export async function exportPage(db: D1Database, after: number, limit: number, sightingAfter: number | null = null) {
  const rows: ExportRow[] = []
  if (sightingAfter !== null) {
    const continuation = await db.prepare(`SELECT e.*, ${EXPORT_EVIDENCE} FROM entries e JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${WHO('s.created_by')} WHERE e.id = ? AND e.merged_into IS NULL AND e.hidden_at IS NULL AND s.id > ? ORDER BY s.id LIMIT ?`).bind(after, sightingAfter, limit + 1).all<ExportRow>()
    rows.push(...continuation.results)
  }
  if (rows.length <= limit) {
    const following = await db.prepare(`SELECT e.*, ${EXPORT_EVIDENCE} FROM entries e INDEXED BY entries_live_export LEFT JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${WHO('s.created_by')} WHERE e.id > ? AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY e.id, s.id LIMIT ?`).bind(after, limit + 1 - rows.length).all<ExportRow>()
    rows.push(...following.results)
  }
  const page: (Entry & { evidence: Sighting[] })[] = []
  let lastSighting: number | null = null
  for (const { evidence_json, ...entry } of rows.slice(0, limit)) {
    let item = page.at(-1)
    if (!item || item.id !== entry.id) page.push(item = { ...entry, evidence: [] })
    const sighting = evidence_json === null ? null : JSON.parse(evidence_json) as Sighting
    if (sighting) item.evidence.push(sighting)
    lastSighting = sighting?.id ?? null
  }
  return { entries: page, next: rows.length > limit ? page.at(-1)!.id : null, next_sighting: rows.length > limit ? lastSighting : null }
}

// Records already described by exactly this sequence, offered while someone is adding one.
export async function sameIds(db: D1Database, ids: string) {
  const { results } = await db.prepare('SELECT id, ids, cover_key FROM entries INDEXED BY entries_live_ids WHERE ids = ? AND merged_into IS NULL AND hidden_at IS NULL ORDER BY id LIMIT 6').bind(ids).all<{ id: number; ids: string; cover_key: string | null }>()
  return results
}
