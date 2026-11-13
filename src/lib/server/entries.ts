// The store of records: an entry is a character, a claim is one thing the record states about it, a
// sighting is one place it was seen, and every state of a record or a sighting is a row in `revisions`.
// Each list reads one range of `entry_tags`, so its cost does not grow with the table, and a record is
// in a list only while it holds that list's tag.
import { CONTEXTS, isScript, isStatus, NEEDS, parseSightingTypes, SIGHTING_TYPES, STATUSES, STYLES, type Need, type SightingType } from '$lib/scripts'
import { cleanIds, encodedCharacter } from '$lib/ids'
import { isDescription } from 'ids-input'
import { referenceComplete } from '$lib/readiness'
import { mapSightings, parseClaims, primaryIdsOf, readClaims, type Claim, type ClaimError } from '$lib/claims'
import { genreOf } from '$lib/genres'
import { BOXES_MAX, MEDIA_MAX } from '$lib/limits'
import { cleanSourceUrl } from '$lib/source-url'
import { hashHex } from './image'

export type EntryFields = { script: string; script_other: string | null; description: string | null; status: string; radical: string | null; strokes: number | null; claims: Claim[] }
export type SightingFields = { place: string; url: string | null; title: string | null; author: string | null; publisher: string | null; report_date: string | null; via_url: string | null; via_title: string | null; via_author: string | null; via_publisher: string | null; via_report_date: string | null; original_date: string | null; page: string | null; context: string | null; style: string | null; types: string | null; note: string | null }
export type StoredImage = { image_key: string; image_type: string; image_w: number; image_h: number; thumb_key: string; box: string | null }  // `box` is a JSON array of [x, y, width, height], or null
export type YearKind = 'report' | 'original'
export type Entry = Omit<EntryFields, 'claims'> & { id: number; rev: number; ids: string | null; cover_key: string | null; cover_place: string | null; sightings: number; types: string | null; first_year: string | null; first_year_kind: YearKind | null; merged_into: number | null; hidden_at: string | null; created_by: string; created_at: string; updated_at: string }
export type Sighting = SightingFields & { id: number; entry_id: number; first_entry: number; rev: number; source_id: number | null; via_id: number | null; media: StoredImage[]; hidden_at: string | null; created_by: string; created_at: string; updated_at: string; by_id?: string; by_name?: string }

// What an entry has one of. What it has several of is in `claims`.
export const ENTRY_FIELDS = ['script', 'script_other', 'description', 'status', 'radical', 'strokes'] as const
// A sighting's citation is its source; the other fields are the sighting's own. A second source, `via_*`,
// is where the contributor found it: a post that shows a page of the cited work, say.
export const CITATION_FIELDS = ['url', 'title', 'author', 'publisher', 'report_date'] as const
export const VIA_FIELDS = ['via_url', 'via_title', 'via_author', 'via_publisher', 'via_report_date'] as const
export const OCCURRENCE_FIELDS = ['place', 'original_date', 'page', 'context', 'style', 'types', 'note'] as const
export const SIGHTING_FIELDS = ['place', 'url', 'title', 'author', 'publisher', 'report_date', ...VIA_FIELDS, 'original_date', 'page', 'context', 'style', 'types', 'note'] as const
export const IMAGE_FIELDS = ['image_key', 'image_type', 'image_w', 'image_h', 'thumb_key', 'box'] as const

const text = (form: FormData, name: string, max: number) => {
  const value = String(form.get(name) ?? '').normalize('NFC').trim()
  return value ? value.slice(0, max) : null
}
// A link kept only when it is a web address, with its tracking parameters dropped.
const link = (form: FormData, name: string) => {
  const value = text(form, name, 1000)
  return value && /^https?:\/\//i.test(value) ? cleanSourceUrl(value) : null
}
const oneOf = (value: string | null, allowed: readonly string[]) => (value && allowed.includes(value) ? value : null)
const now = () => new Date().toISOString()

// A record nobody has checked that states a Unicode code is an encoded character.
const stated = (status: string, claims: readonly Claim[]) => status === 'unchecked' && claims.some(claim => claim.kind === 'encoding' && claim.data?.charset === 'unicode') ? 'encoded' : status

export function readEntryFields(form: FormData, base?: Partial<EntryFields>): { fields: EntryFields; error: ClaimError | null } {
  const script = text(form, 'script', 20)
  const status = text(form, 'status', 20)
  const strokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
  const field = (name: 'script_other' | 'description' | 'radical', max: number) => form.has(name) ? text(form, name, max) : base?.[name] ?? null
  const read = readClaims(form, base?.claims)
  return {
    error: read.error,
    fields: {
      script: isScript(script) ? script : base?.script ?? 'han',
      script_other: field('script_other', 80),
      description: field('description', 20000),
      status: stated(isStatus(status) ? status : base?.status ?? 'unchecked', read.claims),
      radical: field('radical', 20),
      strokes: form.has('strokes') ? (Number.isInteger(strokes) && strokes >= 0 && strokes < 200 ? strokes : null) : base?.strokes ?? null,
      claims: read.claims,
    },
  }
}

export function readSightingFields(form: FormData): SightingFields {
  const safeUrl = link(form, 'url')
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
    via_url: link(form, 'via_url'),
    via_title: text(form, 'via_title', 300),
    via_author: text(form, 'via_author', 300),
    via_publisher: text(form, 'via_publisher', 300),
    via_report_date: text(form, 'via_report_date', 40),
    original_date: text(form, 'original_date', 40),
    page: text(form, 'page', 80),
    context: oneOf(text(form, 'context', 20), CONTEXTS),
    style: oneOf(text(form, 'style', 20), STYLES),
    types: types.length ? JSON.stringify(types) : null,
    note: text(form, 'note', 5000),
  }
}

// The marks of one picture as the form sends them, a JSON array of [x, y, width, height]. Each is kept inside the image.
export function readBoxes(raw: unknown, width: number, height: number) {
  try {
    const boxes = JSON.parse(String(raw))
    if (!Array.isArray(boxes) || !boxes.length || boxes.length > BOXES_MAX) return null
    const kept: number[][] = []
    for (const box of boxes) {
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null
      const x = Math.max(0, Math.round(box[0])), y = Math.max(0, Math.round(box[1]))
      const w = Math.min(width - x, Math.round(box[2])), h = Math.min(height - y, Math.round(box[3]))
      if (w < 4 || h < 4) return null
      kept.push([x, y, w, h])
    }
    return JSON.stringify(kept)
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

type TagInput = Pick<Entry, 'script' | 'status' | 'description' | 'script_other'>
export function facetTags(entry: Pick<Entry, 'script' | 'status' | 'ids' | 'cover_key'>, hasSource: boolean, claims: readonly Claim[] = []) {
  const filters = [`f:${entry.status}`]
  if (!entry.cover_key) filters.push('n:image')
  if (!entry.ids) filters.push('n:ids')
  if (!hasSource) filters.push('n:source')
  const own = new Set<string>()
  for (const claim of claims) {
    if (claim.kind === 'genre') { own.add(`g:${claim.value}`); const parent = genreOf(claim.value)?.parent; if (parent) own.add(`g:${parent}`) }
    else if (claim.kind === 'collection') own.add(`c:${claim.value}`)
    else if (claim.kind === 'tag') own.add(`t:${claim.value}`)
  }
  return ['all', `s:${entry.script}`, ...filters, ...filters.map(filter => `s:${entry.script}|${filter}`), ...own]
}

const WORD_KINDS = ['ids', 'reading', 'meaning', 'encoding', 'relation', 'ivd', 'tag']
function wordTags(entry: TagInput, claims: readonly Claim[], sightings: SightingFields[]) {
  const words = new Set<string>()
  const add = (value: unknown) => { if (typeof value === 'string') for (const term of terms(value)) words.add(term) }
  for (const field of ['description', 'script_other'] as const) add(entry[field])
  for (const claim of claims) if (WORD_KINDS.includes(claim.kind)) { add(claim.value); add(claim.data?.difference); add(claim.data?.evidence) }
  // A Unicode code is found by the character it names, which is what another site links with.
  for (const claim of claims) if (claim.kind === 'encoding' && claim.data?.charset === 'unicode') add(encodedCharacter(claim.value))
  for (const sighting of sightings) for (const field of ['place', 'title', 'author', 'publisher', 'via_title', 'via_author', 'via_publisher', 'note'] as const) add(sighting[field])
  return [...words].slice(0, WORDS_MAX).map(word => `w:${word}`)
}

// A date is free text, so the first four- or three-digit run is read as the year and the rest is left alone.
function firstYear(value: string | null) {
  const match = value?.match(/\d{3,4}/)
  return match ? { text: match[0], n: Number(match[0]) } : null
}

type SightingState = SightingFields & { media?: StoredImage[]; hidden_at?: string | null }

// What a tile shows of a record, read from its visible sightings: the cover, where it was seen, which
// source types it has and the earliest year among them. An older work in a recent post dates the
// sighting, not the post.
function summarize(sightings: SightingState[]) {
  const visible = sightings.filter(sighting => !sighting.hidden_at)
  const cover = visible.find(sighting => sighting.media?.length)
  const types = new Set<SightingType>()
  let year: { text: string; n: number; kind: YearKind } | null = null
  for (const sighting of visible) {
    for (const type of parseSightingTypes(sighting.types)) types.add(type)
    const report = firstYear(sighting.report_date), original = firstYear(sighting.original_date)
    const found = original && (!report || original.n <= report.n) ? { ...original, kind: 'original' as const } : report ? { ...report, kind: 'report' as const } : null
    if (found && (!year || found.n < year.n)) year = found
  }
  const chosen = SIGHTING_TYPES.filter(type => types.has(type))
  return {
    visible,
    cover_key: cover?.media?.[0].thumb_key ?? null,
    cover_place: (cover ?? visible[0])?.place ?? null,
    types: chosen.length ? JSON.stringify(chosen) : null,
    first_year: year?.text ?? null,
    first_year_kind: year?.kind ?? null,
    hasSource: visible.some(referenceComplete),
  }
}

const tagsOf = (entry: Entry, claims: readonly Claim[], summary: ReturnType<typeof summarize>) =>
  [...facetTags({ ...entry, ids: primaryIdsOf(claims), cover_key: summary.cover_key }, summary.hasSource, claims), ...wordTags(entry, claims, summary.visible)]
const facet = (tag: string) => !tag.startsWith('w:')
const SUMMARY_SET = 'ids = ?, cover_key = ?, cover_place = ?, sightings = ?, types = ?, first_year = ?, first_year_kind = ?'
const summaryValues = (claims: readonly Claim[], summary: ReturnType<typeof summarize>) => [primaryIdsOf(claims), summary.cover_key, summary.cover_place, summary.visible.length, summary.types, summary.first_year, summary.first_year_kind]

// Brings a record's tags, counts and summary up to date. It answers the statements, to run with the
// write they belong to.
async function reindex(db: D1Database, id: number, entry: Entry, claims: readonly Claim[], sightings: SightingState[]) {
  const summary = summarize(sightings)
  const live = !entry.merged_into && !entry.hidden_at
  const next = live ? tagsOf(entry, claims, summary) : []
  const { results } = await db.prepare('SELECT tag FROM entry_tags WHERE entry_id = ?').bind(id).all<{ tag: string }>()
  const current = new Set(results.map(row => row.tag)), wanted = new Set(next)
  const gone = [...current].filter(tag => !wanted.has(tag)), added = [...wanted].filter(tag => !current.has(tag))
  return [
    db.prepare(`UPDATE entries SET ${SUMMARY_SET} WHERE id = ?`).bind(...summaryValues(claims, summary), id),
    db.prepare('DELETE FROM entry_tags WHERE entry_id = ? AND tag IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(gone)),
    db.prepare('INSERT OR IGNORE INTO entry_tags(tag, entry_id) SELECT value, ? FROM json_each(?)').bind(id, JSON.stringify(added)),
    db.prepare('UPDATE tag_counts SET n = n - 1 WHERE tag IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gone.filter(facet))),
    db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(added.filter(facet))),
  ]
}

// ---------- Claims, sources and pictures as statements ----------

const ENTRY_SEQ = "(SELECT seq FROM sqlite_sequence WHERE name = 'entries')"
const SIGHTING_SEQ = "(SELECT seq FROM sqlite_sequence WHERE name = 'sightings')"

// `owner` is an id to bind or one of the sequence reads above, for a row made in the same batch.
const owned = (owner: number | string) => ({ sql: typeof owner === 'number' ? '?' : owner, values: typeof owner === 'number' ? [owner] : [] })

const CLAIM_COLUMNS = ['key', 'kind', 'value', 'data', 'sightings', 'under'] as const

function insertClaims(db: D1Database, entry: number | string, claims: readonly Claim[]) {
  const { sql, values } = owned(entry)
  return db.prepare(`INSERT INTO claims(entry_id, position, ${CLAIM_COLUMNS.join(', ')}) SELECT ${sql}, key, ${CLAIM_COLUMNS.map(column => `json_extract(value, '$.${column}')`).join(', ')} FROM json_each(?)`).bind(...values, JSON.stringify(claims))
}

function insertMedia(db: D1Database, sighting: number | string, media: readonly StoredImage[]) {
  const { sql, values } = owned(sighting)
  return db.prepare(`INSERT INTO sighting_media(sighting_id, position, ${IMAGE_FIELDS.join(', ')}) SELECT ${sql}, key, ${IMAGE_FIELDS.map(field => `json_extract(value, '$.${field}')`).join(', ')} FROM json_each(?)`).bind(...values, JSON.stringify(media.slice(0, MEDIA_MAX)))
}

// A claim may rest only on sightings of its own record. A hidden one is still the record's, so a claim
// keeps naming it and the page leaves it out until it is shown again.
function ownClaims(claims: readonly Claim[], sightings: { id: number }[]) {
  const own = new Set(sightings.map(sighting => sighting.id))
  return mapSightings(claims, id => own.has(id) ? id : null)
}

// A record that is being made names the sightings behind a claim by their place among its own, from 1.
// Once they are rows, the claims take their ids, and the version the journal opened with takes them too.
const CITED_BY_PLACE = `UPDATE claims SET sightings = (SELECT json_group_array((SELECT s.id FROM (SELECT id, row_number() OVER (ORDER BY id) AS place FROM sightings WHERE entry_id = claims.entry_id) s WHERE s.place = named.value)) FROM json_each(claims.sightings) named) WHERE entry_id = ${ENTRY_SEQ} AND sightings != '[]'`
const CITED_IN_SNAPSHOT = `UPDATE revisions SET snapshot = json_set(snapshot, '$.claims', json((SELECT json_group_array(json(json_set(claim.value, '$.sightings', json((SELECT k.sightings FROM claims k WHERE k.entry_id = revisions.entry_id AND k.key = json_extract(claim.value, '$.key')))))) FROM json_each(revisions.snapshot, '$.claims') claim))) WHERE entry_id = ${ENTRY_SEQ} AND kind = 'create'`

// The citation is the source's identity: the same five fields are the same row, whether a sighting cites
// it as its work or as where it was found.
async function citationOf(db: D1Database, values: (string | null)[]) {
  if (values.every(value => value === null)) return { hash: null, statements: [] }
  const hash = await hashHex(JSON.stringify(values))
  return { hash, statements: [db.prepare(`INSERT INTO sources(hash, ${CITATION_FIELDS.join(', ')}) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING`).bind(hash, ...values)] }
}
// The hashes bind to the source and via columns, in that order.
async function sourceOf(db: D1Database, fields: SightingFields) {
  const [work, via] = await Promise.all([citationOf(db, CITATION_FIELDS.map(field => fields[field])), citationOf(db, VIA_FIELDS.map(field => fields[field]))])
  return { hashes: [work.hash, via.hash], statements: [...work.statements, ...via.statements] }
}
const SOURCE_ID = '(SELECT id FROM sources WHERE hash = ?)'

const snapshotOf = <T extends object>(row: T, fields: readonly (keyof T)[]) => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))
const entrySnapshot = (fields: EntryFields) => JSON.stringify({ ...snapshotOf(fields, ENTRY_FIELDS), claims: fields.claims })
const sightingSnapshot = (row: SightingFields, media: readonly StoredImage[]) => JSON.stringify({ ...snapshotOf(row, SIGHTING_FIELDS), media })

type Who = { actor: string; ip: string | null }
function revision(db: D1Database, who: Who, row: { entry: number; sighting?: number | null; kind: string; rev: number; snapshot: string; summary?: string | null }) {
  return db.prepare('INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at, ip_hash) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(row.entry, row.sighting ?? null, row.kind, row.rev, row.snapshot, row.summary ?? null, who.actor, now(), who.ip)
}

// ---------- Writes ----------

const OCCURRENCE_COLUMNS = OCCURRENCE_FIELDS.join(', ')
const OCCURRENCE_MARKS = OCCURRENCE_FIELDS.map(() => '?').join(', ')

export type SightingDraft = { fields: SightingFields; media: StoredImage[] }

// `more` are further sightings the record starts with. They go in the same batch as the record and its
// first sighting, so all of them are saved or none is. The sightings have no ids before this write, so a
// claim of `fields` names the ones that support it by their place among them: 1 is `sighting`, 2 the
// first of `more`.
export async function createEntry(db: D1Database, fields: EntryFields, sighting: SightingFields, media: StoredImage[], who: Who, more: SightingDraft[] = []) {
  const at = now()
  const drafts = [{ fields: sighting, media }, ...more]
  const claims = mapSightings(fields.claims, place => place <= drafts.length ? place : null)
  const sources = await Promise.all(drafts.map(draft => sourceOf(db, draft.fields)))
  const summary = summarize(drafts.map(draft => ({ ...draft.fields, media: draft.media })))
  const tags = [...new Set(tagsOf({ ...fields, merged_into: null, hidden_at: null } as unknown as Entry, claims, summary))]
  // AUTOINCREMENT sequences are read inside the same transaction as the inserts.
  const results = await db.batch<{ id: number }>([
    db.prepare(`INSERT INTO entries(${ENTRY_FIELDS.join(', ')}, created_by, created_at, updated_at) VALUES(${ENTRY_FIELDS.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`)
      .bind(...ENTRY_FIELDS.map(field => fields[field]), who.actor, at, at),
    insertClaims(db, ENTRY_SEQ, claims),
    db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${ENTRY_SEQ}, 'create', 1, ?, ?, ?, ?)`)
      .bind(entrySnapshot({ ...fields, claims }), who.actor, at, who.ip),
    ...drafts.flatMap((draft, index) => [
      ...sources[index].statements,
      db.prepare(`INSERT INTO sightings(entry_id, first_entry, source_id, via_id, ${OCCURRENCE_COLUMNS}, created_by, created_at, updated_at) VALUES(${ENTRY_SEQ}, ${ENTRY_SEQ}, ${SOURCE_ID}, ${SOURCE_ID}, ${OCCURRENCE_MARKS}, ?, ?, ?)`)
        .bind(...sources[index].hashes, ...OCCURRENCE_FIELDS.map(field => draft.fields[field]), who.actor, at, at),
      insertMedia(db, SIGHTING_SEQ, draft.media),
      db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${ENTRY_SEQ}, ${SIGHTING_SEQ}, 'sighting', 1, ?, ?, ?, ?)`)
        .bind(sightingSnapshot(draft.fields, draft.media), who.actor, at, who.ip),
    ]),
    ...(claims.some(claim => claim.sightings.length) ? [db.prepare(CITED_BY_PLACE), db.prepare(CITED_IN_SNAPSHOT)] : []),
    db.prepare(`UPDATE entries SET ${SUMMARY_SET} WHERE id = ${ENTRY_SEQ}`).bind(...summaryValues(claims, summary)),
    db.prepare(`INSERT INTO entry_tags(tag, entry_id) SELECT value, ${ENTRY_SEQ} FROM json_each(?)`).bind(JSON.stringify(tags)),
    db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(tags.filter(facet))),
  ])
  return results[0].results[0].id
}

export type EditResult = { ok: true; rev: number } | { ok: false; code: 'missing' | 'conflict' | 'merged' }

const revisionMark = async (db: D1Database, id: number) => (await db.prepare('SELECT COALESCE(MAX(id), 0) AS mark FROM revisions WHERE entry_id = ?').bind(id).first<{ mark: number }>())!.mark
// A row of an unknown kind breaks the journal's CHECK, which undoes the whole batch.
const abort = "'conflict', 0, '{}'"
const checkMark = (db: D1Database, id: number, mark: number, who: Who) => db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE (SELECT COALESCE(MAX(id), 0) FROM revisions WHERE entry_id = ?) != ?`).bind(id, who.actor, now(), id, mark)
const checkChanged = (db: D1Database, id: number, who: Who) => db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE changes() = 0`).bind(id, who.actor, now())

// A redaction writes to the journal, so one made after the mark is read stops the batch; this catches
// one made before it. `from` is the revision a restore copies.
const redacted = async (db: D1Database, from: number | null) => from !== null && Boolean(await db.prepare('SELECT 1 FROM revisions WHERE id = ? AND redacted_at IS NOT NULL').bind(from).first())

export async function editEntry(db: D1Database, id: number, baseRev: number, fields: EntryFields, who: Who, summary: string | null, kind: 'edit' | 'revert' = 'edit', from: number | null = null): Promise<EditResult> {
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, id)
    if (await redacted(db, from)) return { ok: false, code: 'missing' }
    const entry = await getEntryRow(db, id)
    if (!entry || entry.hidden_at) return { ok: false, code: 'missing' }
    if (entry.merged_into) return { ok: false, code: 'merged' }
    if (entry.rev !== baseRev) return { ok: false, code: 'conflict' }
    const rev = entry.rev + 1
    const sightings = await sightingRows(db, id)
    const claims = ownClaims(fields.claims, sightings)
    const current = await claimRows(db, id)
    const next = { ...fields, claims }
    const index = await reindex(db, id, { ...entry, ...snapshotOf(fields, ENTRY_FIELDS), rev } as Entry, claims, sightings)
    try {
      await db.batch([
        checkMark(db, id, mark, who),
        db.prepare(`UPDATE entries SET ${ENTRY_FIELDS.map(field => `${field} = ?`).join(', ')}, rev = ?, updated_at = ? WHERE id = ? AND rev = ? AND merged_into IS NULL`)
          .bind(...ENTRY_FIELDS.map(field => fields[field]), rev, now(), id, baseRev),
        // Abort the entire batch when a concurrent writer won the revision.
        checkChanged(db, id, who),
        ...(JSON.stringify(current) === JSON.stringify(claims) ? [] : [db.prepare('DELETE FROM claims WHERE entry_id = ?').bind(id), insertClaims(db, id, claims)]),
        revision(db, who, { entry: id, kind, rev, snapshot: entrySnapshot(next), summary }),
        ...index,
      ])
      return { ok: true, rev }
    } catch (error) {
      const latest = await getEntryRow(db, id)
      if (!latest) return { ok: false, code: 'missing' }
      if (latest.merged_into) return { ok: false, code: 'merged' }
      if (latest.rev !== baseRev) return { ok: false, code: 'conflict' }
      if (await revisionMark(db, id) !== mark && attempt < 4) continue
      throw error
    }
  }
}

export class SightingLimitError extends Error {
  constructor() {
    super('This entry has reached the 200-sighting limit.')
    this.name = 'SightingLimitError'
  }
}

export async function addSighting(db: D1Database, id: number, fields: SightingFields, media: StoredImage[], who: Who) {
  const source = await sourceOf(db, fields)
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, id)
    const entry = await getEntryRow(db, id)
    if (!entry || entry.hidden_at || entry.merged_into) return null
    const sightings = await sightingRows(db, id)
    if (sightings.length >= SIGHTINGS_MAX) throw new SightingLimitError()
    const index = await reindex(db, id, entry, await claimRows(db, id), [...sightings, { ...fields, media }])
    const at = now()
    const before = [
      checkMark(db, id, mark, who),
      db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE EXISTS (SELECT 1 FROM sightings WHERE entry_id = ? LIMIT 1 OFFSET ${SIGHTINGS_MAX - 1})`).bind(id, who.actor, at, id),
      ...source.statements,
    ]
    try {
      const results = await db.batch<{ id: number }>([
        ...before,
        db.prepare(`INSERT INTO sightings(entry_id, first_entry, source_id, via_id, ${OCCURRENCE_COLUMNS}, created_by, created_at, updated_at) VALUES(?, ?, ${SOURCE_ID}, ${SOURCE_ID}, ${OCCURRENCE_MARKS}, ?, ?, ?) RETURNING id`)
          .bind(id, id, ...source.hashes, ...OCCURRENCE_FIELDS.map(field => fields[field]), who.actor, at, at),
        insertMedia(db, SIGHTING_SEQ, media),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(at, id),
        db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(?, ${SIGHTING_SEQ}, 'sighting', 1, ?, ?, ?, ?)`)
          .bind(id, sightingSnapshot(fields, media), who.actor, at, who.ip),
        ...index,
      ])
      return results[before.length].results[0].id
    } catch (error) {
      if (attempt < 4 && await revisionMark(db, id) !== mark) continue
      if ((await sightingRows(db, id)).length >= SIGHTINGS_MAX) throw new SightingLimitError()
      throw error
    }
  }
}

// `media` is the whole list the sighting should hold, or null to leave its pictures as they are.
export async function editSighting(db: D1Database, id: number, baseRev: number, fields: SightingFields, media: StoredImage[] | null, who: Who, summary: string | null, expectedEntry: number): Promise<EditResult> {
  return writeSighting(db, id, baseRev, fields, media, who, summary, expectedEntry)
}

export async function restoreSighting(db: D1Database, entryId: number, sightingId: number, baseRev: number, fields: SightingFields, who: Who, sourceRev: number, from: number | null = null): Promise<EditResult> {
  return writeSighting(db, sightingId, baseRev, fields, null, who, `r${sourceRev}`, entryId, from)
}

async function writeSighting(db: D1Database, id: number, baseRev: number, fields: SightingFields, media: StoredImage[] | null, who: Who, summary: string | null, expectedEntry: number, from: number | null = null): Promise<EditResult> {
  const source = await sourceOf(db, fields)
  for (let attempt = 0; ; attempt++) {
    const initial = await sightingRow(db, id)
    if (!initial || initial.entry_id !== expectedEntry) return { ok: false, code: 'missing' }
    const mark = await revisionMark(db, initial.entry_id)
    if (await redacted(db, from)) return { ok: false, code: 'missing' }
    const sightings = await sightingRows(db, initial.entry_id)
    const current = sightings.find(sighting => sighting.id === id)
    if (!current) {
      if (attempt < 4) continue
      return { ok: false, code: 'conflict' }
    }
    if (current.rev !== baseRev) return { ok: false, code: 'conflict' }
    const entry = await getEntryRow(db, current.entry_id)
    if (!entry || entry.hidden_at || current.hidden_at) return { ok: false, code: 'missing' }
    if (entry.merged_into) return { ok: false, code: 'merged' }
    const rev = current.rev + 1
    const kept = media ?? current.media
    const index = await reindex(db, current.entry_id, entry, await claimRows(db, current.entry_id), sightings.map(s => s.id === id ? { ...s, ...fields, media: kept } : s))
    try {
      await db.batch([
        checkMark(db, current.entry_id, mark, who),
        ...source.statements,
        db.prepare(`UPDATE sightings SET source_id = ${SOURCE_ID}, via_id = ${SOURCE_ID}, ${OCCURRENCE_FIELDS.map(column => `${column} = ?`).join(', ')}, rev = ?, updated_at = ? WHERE id = ? AND entry_id = ? AND rev = ? AND hidden_at IS NULL AND EXISTS (SELECT 1 FROM entries WHERE id = sightings.entry_id AND hidden_at IS NULL AND merged_into IS NULL)`)
          .bind(...source.hashes, ...OCCURRENCE_FIELDS.map(field => fields[field]), rev, now(), id, current.entry_id, baseRev),
        checkChanged(db, current.entry_id, who),
        // A source no sighting cites any more, as its work or as where it was found, is not kept.
        ...[...new Set([current.source_id, current.via_id])].filter(id => id !== null).map(id => db.prepare('DELETE FROM sources WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM sightings WHERE source_id = ?1) AND NOT EXISTS (SELECT 1 FROM sightings WHERE via_id = ?1)').bind(id)),
        ...(media ? [db.prepare('DELETE FROM sighting_media WHERE sighting_id = ?').bind(id), insertMedia(db, id, media)] : []),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(now(), current.entry_id),
        revision(db, who, { entry: current.entry_id, sighting: id, kind: 'sighting_edit', rev, snapshot: sightingSnapshot(fields, kept), summary }),
        ...index,
      ])
      return { ok: true, rev }
    } catch (error) {
      const latest = await sightingRow(db, id)
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

/** The fields an entry revision holds, or null when it is not one this app wrote. */
export function entryFieldsOf(raw: string): EntryFields | null {
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isScript(value.script) || !isStatus(value.status)) return null
    for (const field of ['script_other', 'description', 'radical'] as const) if (typeof value[field] !== 'string' && value[field] != null) return null
    if (value.strokes != null && (!Number.isInteger(value.strokes) || value.strokes < 0 || value.strokes >= 200)) return null
    const claims = parseClaims(value.claims ?? [])
    if (!claims) return null
    return { script: value.script, script_other: value.script_other ?? null, description: value.description ?? null, status: value.status, radical: value.radical ?? null, strokes: value.strokes ?? null, claims }
  } catch { return null }
}

// Any revision of a record's fields can be made current again; the journal gains a row and loses none.
export async function revertEntry(db: D1Database, id: number, revisionId: number, who: Who) {
  const old = await db.prepare(`SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND redacted_at IS NULL AND kind IN ('create','edit','revert')`).bind(revisionId, id).first<{ snapshot: string; rev: number }>()
  const entry = await getEntryRow(db, id)
  const fields = old ? entryFieldsOf(old.snapshot) : null
  if (!old || !entry || !fields) return { ok: false as const, code: 'missing' as const }
  return editEntry(db, id, entry.rev, fields, who, `r${old.rev}`, 'revert', revisionId)
}

// A redacted revision keeps its row, author and time, and no longer says what the record held. The
// state a record or a sighting holds now is not a past one, and stays.
export async function redactRevision(db: D1Database, entry: number, revisionId: number, who: Who, summary: string | null) {
  const row = await db.prepare(`SELECT r.rev, r.sighting_id, CASE WHEN r.sighting_id IS NULL THEN e.rev ELSE s.rev END AS current FROM revisions r JOIN entries e ON e.id = r.entry_id LEFT JOIN sightings s ON s.id = r.sighting_id WHERE r.id = ? AND r.entry_id = ? AND r.redacted_at IS NULL AND r.kind IN ('create','edit','revert','sighting','sighting_edit')`).bind(revisionId, entry).first<{ rev: number; sighting_id: number | null; current: number | null }>()
  if (!row || row.current === row.rev) return false
  await db.batch([
    db.prepare(`UPDATE revisions SET snapshot = '{}', summary = NULL, redacted_at = ?, redacted_by = ? WHERE id = ?`).bind(now(), who.actor, revisionId),
    revision(db, who, { entry, sighting: row.sighting_id, kind: 'redact', rev: row.rev, snapshot: JSON.stringify({ revision: revisionId }), summary }),
  ])
  return true
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
      sighting ? entry : { ...entry, hidden_at: at }, await claimRows(db, target.entry),
      sighting ? sightings.map(s => s.id === sighting.id ? { ...s, hidden_at: at } : s) : sightings)
    const update = sighting
      ? db.prepare('UPDATE sightings SET hidden_at = ? WHERE id = ? AND entry_id = ?').bind(at, sighting.id, target.entry)
      : db.prepare('UPDATE entries SET hidden_at = ? WHERE id = ?').bind(at, target.entry)
    try {
      await db.batch([
        checkMark(db, target.entry, mark, who), update,
        checkChanged(db, target.entry, who),
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
  if (entry) await db.batch(await reindex(db, id, entry, await claimRows(db, id), await sightingRows(db, id)))
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
const CITATION_COLUMNS = [...CITATION_FIELDS.map(field => `c.${field}`), ...CITATION_FIELDS.map(field => `v.${field} AS via_${field}`)].join(', ')
const CITATION = 'LEFT JOIN sources c ON c.id = s.source_id LEFT JOIN sources v ON v.id = s.via_id'

export const getEntryRow = (db: D1Database, id: number) => db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first<Entry>()

type ClaimRow = { key: string; kind: string; value: string; data: string | null; sightings: string; under: string }
const toClaim = (row: ClaimRow): Claim => ({ key: row.key, kind: row.kind as Claim['kind'], value: row.value, data: row.data ? JSON.parse(row.data) : null, sightings: JSON.parse(row.sightings), under: JSON.parse(row.under) })
export const claimRows = async (db: D1Database, id: number) => (await db.prepare(`SELECT ${CLAIM_COLUMNS.join(', ')} FROM claims WHERE entry_id = ? ORDER BY position`).bind(id).all<ClaimRow>()).results.map(toClaim)

type MediaRow = StoredImage & { sighting_id: number }
function withMedia<T extends { id: number }>(sightings: T[], media: MediaRow[]) {
  const found = new Map<number, StoredImage[]>()
  for (const { sighting_id, ...image } of media) found.set(sighting_id, [...(found.get(sighting_id) ?? []), image])
  return sightings.map(sighting => ({ ...sighting, media: found.get(sighting.id) ?? [] }))
}
const MEDIA_OF_ENTRY = `SELECT x.sighting_id, ${IMAGE_FIELDS.map(field => `x.${field}`).join(', ')} FROM sightings s JOIN sighting_media x ON x.sighting_id = s.id WHERE s.entry_id = ? ORDER BY x.sighting_id, x.position`

// A record's sightings, each with its citation and pictures.
async function sightingRows(db: D1Database, id: number, who = false) {
  const [rows, media] = await db.batch<unknown>([
    db.prepare(`SELECT s.*, ${CITATION_COLUMNS}${who ? `, ${WHO_COLUMNS}` : ''} FROM sightings s ${CITATION} ${who ? WHO('s.created_by') : ''} WHERE s.entry_id = ? ORDER BY s.id LIMIT ${SIGHTINGS_MAX}`).bind(id),
    db.prepare(MEDIA_OF_ENTRY).bind(id),
  ])
  return withMedia(rows.results as Omit<Sighting, 'media'>[], media.results as MediaRow[]) as Sighting[]
}

const sightingRow = (db: D1Database, id: number) => db.prepare('SELECT id, entry_id, rev, hidden_at FROM sightings WHERE id = ?').bind(id).first<Pick<Sighting, 'id' | 'entry_id' | 'rev' | 'hidden_at'>>()

export async function getEntry(db: D1Database, id: number) {
  const entry = await db.prepare(`SELECT e.*, ${WHO_COLUMNS} FROM entries e ${WHO('e.created_by')} WHERE e.id = ?`).bind(id).first<Entry & { by_id: string; by_name: string }>()
  if (!entry) return null
  return { entry, claims: await claimRows(db, id), sightings: await sightingRows(db, id, true) }
}

export async function getSighting(db: D1Database, id: number) {
  const [row, media] = await db.batch<unknown>([
    db.prepare(`SELECT s.*, ${CITATION_COLUMNS} FROM sightings s ${CITATION} WHERE s.id = ?`).bind(id),
    db.prepare(`SELECT sighting_id, ${IMAGE_FIELDS.join(', ')} FROM sighting_media WHERE sighting_id = ? ORDER BY position`).bind(id),
  ])
  return (withMedia(row.results as Omit<Sighting, 'media'>[], media.results as MediaRow[])[0] as Sighting | undefined) ?? null
}

/** Whether a stored object belongs to a sighting anyone may see. */
export async function mediaVisible(db: D1Database, key: string) {
  const live = 'JOIN sightings s ON s.id = x.sighting_id JOIN entries e ON e.id = s.entry_id WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL'
  return Boolean(await db.prepare(`SELECT 1 FROM sighting_media x INDEXED BY sighting_media_by_image ${live} AND x.image_key = ?1 UNION ALL SELECT 1 FROM sighting_media x INDEXED BY sighting_media_by_thumb ${live} AND x.thumb_key = ?1 LIMIT 1`).bind(key).first())
}

export type Listing = { script?: string | null; filter?: string | null; facet?: string | null; query?: string | null; before?: number | null; limit?: number }
export const PAGE = 48
export const SEARCH_WINDOW = 256

// The one key a script and a filter name, or null for a filter that is not one.
export function listTag(script?: string | null, filter?: string | null) {
  const f = !filter ? null : (STATUSES as readonly string[]).includes(filter) ? `f:${filter}` : (NEEDS as readonly string[]).includes(filter as Need) ? `n:${filter}` : undefined
  if (f === undefined || (script && !isScript(script))) return null
  return script && f ? `s:${script}|${f}` : script ? `s:${script}` : f ?? 'all'
}

// A category (`g:`), a collection (`c:`) or a tag (`t:`), as the key it is listed under.
export function facetTag(facet?: string | null) {
  if (!facet) return null
  const match = /^([gct]):([^|\s]{1,40})$/u.exec(facet.normalize('NFC'))
  return match ? `${match[1]}:${match[2]}` : undefined
}

export function exactSearchIds(query: string) {
  const ids = cleanIds(query)
  return isDescription(ids) ? ids : null
}

// The range a listing reads and the tests each row must pass. Null names a listing that is not one.
function listPlan({ script, filter, facet, query }: Listing) {
  const base = listTag(script, filter), own = facetTag(facet)
  if (!base || own === undefined) return null
  if ((query?.trim().length ?? 0) > SEARCH_LENGTH_MAX) return null
  const exact = exactSearchIds(query ?? '')
  const words = exact ? [] : [...new Set(terms(query ?? ''))]
  if (!exact && (words.length > SEARCH_TERMS_MAX || (query?.trim() && !words.length))) return null
  const tests = [...words.map(word => `w:${word}`), ...(own && base !== 'all' ? [base] : [])]
  return { tag: own ?? base, exact, tests, searching: Boolean(exact) || tests.length > 0 }
}

const TILE_COLUMNS = 'e.id, e.ids, e.cover_key, e.sightings, e.status, e.types, e.first_year, e.first_year_kind'

export function listStatement(db: D1Database, listing: Listing) {
  const plan = listPlan(listing)
  if (!plan) return null
  // The facet range drives the query. Word tests are projections, not filters:
  // LIMIT therefore bounds candidates read even when no word matches.
  const tests = [
    ...(plan.exact ? ["EXISTS (SELECT 1 FROM claims k WHERE k.kind = 'ids' AND k.value = ? AND k.entry_id = t.entry_id)"] : []),
    ...plan.tests.map(() => 'EXISTS (SELECT 1 FROM entry_tags w WHERE w.tag = ? AND w.entry_id = t.entry_id)'),
  ].join(' AND ') || '1'
  return db.prepare(`SELECT ${TILE_COLUMNS}, (${tests}) AS matches FROM entry_tags t CROSS JOIN entries e ON e.id = t.entry_id WHERE t.tag = ? AND t.entry_id < ? ORDER BY t.entry_id DESC LIMIT ?`)
    .bind(...(plan.exact ? [plan.exact] : []), ...plan.tests, plan.tag, listing.before ?? Number.MAX_SAFE_INTEGER, (plan.searching ? SEARCH_WINDOW : listing.limit ?? PAGE) + 1)
}

type TileRow = Pick<Entry, 'id' | 'ids' | 'cover_key' | 'sightings' | 'status' | 'types' | 'first_year' | 'first_year_kind'>
export type Tile = Pick<Entry, 'id' | 'ids' | 'cover_key' | 'sightings' | 'status'> & { types: SightingType[]; firstYear: string | null; firstYearKind: YearKind | null }
const toTile = ({ types, first_year, first_year_kind, ...row }: TileRow): Tile => ({ ...row, types: parseSightingTypes(types), firstYear: first_year, firstYearKind: first_year_kind })

export async function list(db: D1Database, listing: Listing) {
  const plan = listPlan(listing), statement = listStatement(db, listing)
  if (!plan || !statement) return null
  const limit = listing.limit ?? PAGE
  const { results } = await statement.all<TileRow & { matches: number }>()
  const window = plan.searching ? SEARCH_WINDOW : limit
  const tiles: Tile[] = []
  let consumed = 0
  for (const { matches, ...row } of results.slice(0, window)) {
    consumed++
    if (matches) tiles.push(toTile(row))
    if (tiles.length === limit) break
  }
  const next = consumed < results.length ? results[consumed - 1].id : null
  return { tiles, next, partial: plan.searching && next !== null && tiles.length < limit }
}

// The counts a page shows beside its filters. Tags are counted too, and read where they are listed.
export async function counts(db: D1Database) {
  const { results } = await db.prepare(`SELECT tag, n FROM tag_counts WHERE n > 0 AND tag NOT LIKE '%|%' AND tag NOT LIKE 't:%'`).all<{ tag: string; n: number }>()
  return Object.fromEntries(results.map(row => [row.tag, row.n])) as Record<string, number>
}

export const TAGS_MAX = 200
export async function tagCounts(db: D1Database) {
  const { results } = await db.prepare(`SELECT substr(tag, 3) AS tag, n FROM tag_counts WHERE tag >= 't:' AND tag < 't;' AND n > 0 ORDER BY n DESC, tag LIMIT ${TAGS_MAX}`).all<{ tag: string; n: number }>()
  return results
}

export type Source = { id: number; url: string | null; title: string | null; author: string | null; publisher: string | null; report_date: string | null }
export const SOURCE_PAGE = 200

// A source and the records seen in it, each once, with the pages it was seen on.
export type SourceSighting = Pick<Sighting, 'id' | 'entry_id' | 'place' | 'original_date' | 'page' | 'context' | 'style' | 'note' | 'media'> & { types: SightingType[]; tile: Tile; via: boolean }
const SOURCE_SIGHTING = ['place', 'original_date', 'page', 'context', 'style', 'types', 'note'].map(field => `s.${field} AS s_${field}`).join(', ')

// A source with the visible sightings that cite it, each with its pictures and the record it belongs to:
// first those that cite it as their work, then those found through it. A sighting that cites one source
// both ways is listed once, as its work.
export async function sourcePage(db: D1Database, id: number) {
  const direct = { column: 'source_id', index: 'sightings_by_source', extra: '' }
  const via = { column: 'via_id', index: 'sightings_by_via', extra: ' AND s.source_id IS NOT s.via_id' }
  const live = (way: typeof direct) => `s.${way.column} = ? AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL${way.extra}`
  const from = (way: typeof direct) => `sightings s INDEXED BY ${way.index} CROSS JOIN entries e ON e.id = s.entry_id`
  const [found, ...queries] = await db.batch<unknown>([
    db.prepare(`SELECT id, ${CITATION_FIELDS.join(', ')} FROM sources WHERE id = ?`).bind(id),
    ...[direct, via].flatMap(way => [
      db.prepare(`SELECT ${TILE_COLUMNS}, s.id AS s_id, ${SOURCE_SIGHTING} FROM ${from(way)} WHERE ${live(way)} ORDER BY s.id LIMIT ${SOURCE_PAGE}`).bind(id),
      db.prepare(`SELECT x.sighting_id, ${IMAGE_FIELDS.map(field => `x.${field}`).join(', ')} FROM ${from(way)} JOIN sighting_media x ON x.sighting_id = s.id WHERE ${live(way)} ORDER BY s.id, x.position LIMIT ${SOURCE_PAGE * MEDIA_MAX}`).bind(id),
    ]),
  ])
  const source = found.results[0] as Source | undefined
  type Row = TileRow & { s_id: number; s_place: string; s_original_date: string | null; s_page: string | null; s_context: string | null; s_style: string | null; s_types: string | null; s_note: string | null }
  const listed = [false, true].flatMap((isVia, way) => withMedia((queries[way * 2].results as Row[]).map(({ s_id, s_place, s_original_date, s_page, s_context, s_style, s_types, s_note, ...tile }) => ({
    id: s_id, entry_id: tile.id, place: s_place, original_date: s_original_date, page: s_page, context: s_context, style: s_style, note: s_note, types: parseSightingTypes(s_types), tile: toTile(tile), via: isVia,
  })), queries[way * 2 + 1].results as MediaRow[]) as SourceSighting[]).slice(0, SOURCE_PAGE)
  // A citation is shown only while a visible sighting gives it.
  if (!source || !listed.length) return null
  return { source, sightings: listed }
}

// The records that state this value: the ones described by a sequence, given a code, or related to a character.
export async function claimedBy(db: D1Database, kind: Claim['kind'], value: string, limit = 6) {
  const { results } = await db.prepare('SELECT e.id, e.ids, e.cover_key FROM claims k CROSS JOIN entries e ON e.id = k.entry_id WHERE k.kind = ? AND k.value = ? AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY k.entry_id LIMIT ?').bind(kind, value, limit).all<{ id: number; ids: string | null; cover_key: string | null }>()
  return results
}

// Records already described by exactly this sequence, offered while someone is adding one.
export const sameIds = (db: D1Database, ids: string) => claimedBy(db, 'ids', ids)

export type Revision = { id: number; entry_id: number; sighting_id: number | null; kind: string; rev: number; snapshot: string; summary: string | null; at: string; redacted_at: string | null; by_id: string; by_name: string; cover_key?: string | null; ids?: string | null; sighting_rev?: number | null }

export const HISTORY_PAGE = 60
const REVISION_COLUMNS = 'r.id, r.entry_id, r.sighting_id, r.kind, r.rev, r.snapshot, r.summary, r.at, r.redacted_at'

// A page of one record's journal. Each row carries a whole snapshot, so the page is kept short.
export const ENTRY_HISTORY_PAGE = 200
export async function history(db: D1Database, entry: number, before?: number | null) {
  const { results } = await db.prepare(`SELECT ${REVISION_COLUMNS}, ${WHO_COLUMNS} FROM revisions r ${WHO('r.actor')} WHERE r.entry_id = ? AND r.id < ? ORDER BY r.id DESC LIMIT ${ENTRY_HISTORY_PAGE + 1}`).bind(entry, before ?? Number.MAX_SAFE_INTEGER).all<Revision>()
  return results
}

const FEED_COLUMNS = `${REVISION_COLUMNS}, ${WHO_COLUMNS}, e.cover_key, e.ids, s.rev AS sighting_rev, (e.hidden_at IS NULL AND e.merged_into IS NULL AND (r.sighting_id IS NULL OR (s.id IS NOT NULL AND s.hidden_at IS NULL))) AS visible`
const FEED_JOINS = `CROSS JOIN entries e ON e.id = r.entry_id LEFT JOIN sightings s ON s.id = r.sighting_id AND s.entry_id = r.entry_id ${WHO('r.actor')}`

export function globalHistoryStatement(db: D1Database, before?: number | null) {
  // Range over at most HISTORY_PAGE + 1 revisions, even when every target is private.
  return db.prepare(`SELECT ${FEED_COLUMNS} FROM revisions r ${FEED_JOINS} WHERE r.id < ? ORDER BY r.id DESC LIMIT ?`)
    .bind(before ?? Number.MAX_SAFE_INTEGER, HISTORY_PAGE + 1)
}

export async function globalHistory(db: D1Database, before?: number | null) {
  const { results } = await globalHistoryStatement(db, before).all<Revision & { visible: number }>()
  const rows = results.slice(0, HISTORY_PAGE).filter(row => row.visible).map(({ visible, ...row }) => row)
  return { rows, next: results.length > HISTORY_PAGE ? results[HISTORY_PAGE - 1].id : null }
}

export function personRevisionsStatement(db: D1Database, id: string, before?: number | null) {
  // The account and the anonymous people merged into it share one list. The subquery keeps the
  // revision range on the actor index rather than reading the journal from its newest row.
  return db.prepare(`SELECT ${FEED_COLUMNS} FROM revisions r ${FEED_JOINS} WHERE r.actor IN (SELECT id FROM people WHERE id = ? OR merged_into = ?) AND r.id < ? ORDER BY r.id DESC LIMIT ?`)
    .bind(id, id, before ?? Number.MAX_SAFE_INTEGER, HISTORY_PAGE + 1)
}

export async function ofPerson(db: D1Database, id: string, before?: number | null) {
  const person = await db.prepare('SELECT id, name, atlas_sub, created_at, merged_into FROM people WHERE id = ?').bind(id).first<{ id: string; name: string; atlas_sub: string | null; created_at: string; merged_into: string | null }>()
  if (!person) return null
  const { results } = await personRevisionsStatement(db, id, before).all<Revision & { visible: number }>()
  const rows = results.slice(0, HISTORY_PAGE).filter(row => row.visible).map(({ visible, ...row }) => row)
  return { person, rows, next: results.length > HISTORY_PAGE ? results[HISTORY_PAGE - 1].id : null }
}

export const REPORT_PAGE = 100

export async function openReports(db: D1Database, after = 0) {
  const { results } = await db.prepare(`SELECT x.id, x.entry_id, x.sighting_id, x.reason, x.at, ${WHO_COLUMNS}, e.cover_key, e.ids, e.hidden_at, CASE WHEN x.sighting_id IS NULL THEN e.hidden_at ELSE s.hidden_at END AS target_hidden_at FROM reports x ${WHO('x.reporter')} JOIN entries e ON e.id = x.entry_id LEFT JOIN sightings s ON s.id = x.sighting_id AND s.entry_id = x.entry_id WHERE x.resolved_at IS NULL AND x.id > ? ORDER BY x.id LIMIT ?`).bind(after, REPORT_PAGE + 1).all<{ id: number; entry_id: number; sighting_id: number | null; reason: string; at: string; by_id: string; by_name: string; cover_key: string | null; ids: string | null; hidden_at: string | null; target_hidden_at: string | null }>()
  return { reports: results.slice(0, REPORT_PAGE), next: results.length > REPORT_PAGE ? results[REPORT_PAGE - 1].id : null }
}

// A page counts evidence rows (or one row for an entry without evidence).
// Entries with many sightings continue with their metadata repeated.
export const EXPORT_PAGE_MAX = 200
const EXPORT_SIGHTING_COLUMNS = ['id', 'entry_id', 'first_entry', 'rev', 'source_id', 'via_id', ...OCCURRENCE_FIELDS, 'hidden_at', 'created_by', 'created_at', 'updated_at'] as const
const EXPORT_MEDIA = `(SELECT json_group_array(json_object(${IMAGE_FIELDS.map(field => `'${field}', x.${field}`).join(', ')})) FROM (SELECT * FROM sighting_media WHERE sighting_id = s.id ORDER BY position) x)`
const EXPORT_EVIDENCE = `CASE WHEN s.id IS NULL THEN NULL ELSE json_object(${EXPORT_SIGHTING_COLUMNS.map(column => `'${column}', s.${column}`).join(', ')}, ${CITATION_FIELDS.map(field => `'${field}', c.${field}`).join(', ')}, ${CITATION_FIELDS.map(field => `'via_${field}', v.${field}`).join(', ')}, 'media', json(${EXPORT_MEDIA}), 'by_id', COALESCE(m.id, p.id), 'by_name', COALESCE(m.name, p.name)) END AS evidence_json`
type ExportRow = Entry & { evidence_json: string | null }
export type ExportEntry = Entry & { claims: Claim[]; evidence: Sighting[] }
export async function exportPage(db: D1Database, after: number, limit: number, sightingAfter: number | null = null) {
  const rows: ExportRow[] = []
  if (sightingAfter !== null) {
    const continuation = await db.prepare(`SELECT e.*, ${EXPORT_EVIDENCE} FROM entries e JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${CITATION} ${WHO('s.created_by')} WHERE e.id = ? AND e.merged_into IS NULL AND e.hidden_at IS NULL AND s.id > ? ORDER BY s.id LIMIT ?`).bind(after, sightingAfter, limit + 1).all<ExportRow>()
    rows.push(...continuation.results)
  }
  if (rows.length <= limit) {
    const following = await db.prepare(`SELECT e.*, ${EXPORT_EVIDENCE} FROM entries e INDEXED BY entries_live_export LEFT JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${CITATION} ${WHO('s.created_by')} WHERE e.id > ? AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY e.id, s.id LIMIT ?`).bind(after, limit + 1 - rows.length).all<ExportRow>()
    rows.push(...following.results)
  }
  const page: ExportEntry[] = []
  let lastSighting: number | null = null
  for (const { evidence_json, ...entry } of rows.slice(0, limit)) {
    let item = page.at(-1)
    if (!item || item.id !== entry.id) page.push(item = { ...entry, claims: [], evidence: [] })
    const sighting = evidence_json === null ? null : JSON.parse(evidence_json) as Sighting
    if (sighting) item.evidence.push(sighting)
    lastSighting = sighting?.id ?? null
  }
  if (page.length) {
    const { results } = await db.prepare(`SELECT entry_id, ${CLAIM_COLUMNS.join(', ')} FROM claims WHERE entry_id IN (SELECT value FROM json_each(?)) ORDER BY entry_id, position`).bind(JSON.stringify(page.map(entry => entry.id))).all<ClaimRow & { entry_id: number }>()
    const found = new Map(page.map(entry => [entry.id, entry.claims]))
    for (const row of results) found.get(row.entry_id)?.push(toClaim(row))
  }
  return { entries: page, next: rows.length > limit ? page.at(-1)!.id : null, next_sighting: rows.length > limit ? lastSighting : null }
}
