import { error } from '@sveltejs/kit'
import { quotations, QUOTATIONS_MAX } from '../quotations'
import { sampledSightings } from './source-sightings'
import { sourceMatches } from './source-aliases'
import { nameKey, nameLabel, sourceNameKey } from '../name-key'
// The store of records: an entry is a character, a claim is one thing the record states about it, a
// sighting is one place it was seen, and every state of a record or a sighting is a row in `revisions`.
// Each list reads one range of `entry_tags`, so its cost does not grow with the table, and a record is
// in a list only while it holds that list's tag.
import { CONTEXTS, isScript, NEEDS, resolveScript, parseSightingTypes, SIGHTING_TYPES, STATUSES, STYLES, VIAS_MAX, type Need, type SightingType, type Status } from '$lib/scripts'
import { cleanIds, codePoints, encodedCharacter } from '$lib/ids'
import { isDescription } from 'ids-input'
import { referenceComplete } from '$lib/readiness'
import { statusOf } from '$lib/status'
import { encodingsOf, mapSightings, parseClaims, primaryIdsOf, primaryLayoutOf, readClaims, valuesOf, type Claim, type ClaimError } from '$lib/claims'
import { layoutText } from '$lib/layout'
import { MARKED, registeredIn } from '$lib/registries'
import { FILE_ROWS, ensureTags, filedUnder } from './tags'
import type { Tag } from '$lib/tags'
import { BRANCH_MIN, fileRecord, KANGXI, parsePath, pathsOf, radicalEquivalent } from '$lib/radicals'
import { groupMates } from '$lib/similar'
import { PART_RUN_MAX, PART_SPELLINGS_MAX } from '$lib/ids-variants'
import { BOXES_MAX, MEDIA_MAX } from '$lib/limits'
import { cleanSourceUrl } from '$lib/source-url'
import { dateText } from '$lib/dates'
import { datedYear, prepareDates, readDates, sightingDates, type DateBook } from './date-readings'
import { hashHex } from './image'
import { ORDER, PAGE, SEEDS, seedOf, type Order, type SourceSort } from '$lib/order'

export type EntryFields = { script: string; script_other: string | null; description: string | null; radical: string | null; strokes: number | null; claims: Claim[] }
// A source as its five citation fields. A sighting's `vias` list them from the one nearest the cited work outward.
export type Citation = Record<typeof CITATION_FIELDS[number], string | null>
// A link in a sighting's chain: the source, and the words of it this sighting quotes.
export type Via = Citation & { quote: string | null }
export type SightingFields = { place: string; url: string | null; title: string | null; author: string | null; publisher: string | null; report_date: string | null; vias: Via[]; original_date: string | null; page: string | null; context: string | null; style: string | null; types: string | null; note: string | null; quotes: string | null }
export type StoredImage = { image_key: string; image_type: string; image_w: number; image_h: number; thumb_key: string; box: string | null }  // `box` is a JSON array of [x, y, width, height], or null
export type YearKind = 'report' | 'original'
export type Entry = Omit<EntryFields, 'claims'> & { status: Status | null; id: number; rev: number; ids: string | null; layout: string | null; cover_key: string | null; cover_place: string | null; sightings: number; types: string | null; first_year: string | null; first_year_kind: YearKind | null; marks: string | null; merged_into: number | null; hidden_at: string | null; created_by: string; created_at: string; updated_at: string }
export type Sighting = Omit<SightingFields, 'vias'> & { id: number; entry_id: number; first_entry: number; rev: number; source_id: number | null; vias: (Via & { id: number })[]; media: StoredImage[]; hidden_at: string | null; created_by: string; created_at: string; updated_at: string; by_id?: string; by_name?: string }

// What an entry has one of. What it has several of is in `claims`.
export const ENTRY_FIELDS = ['script', 'script_other', 'description', 'radical', 'strokes'] as const
// A sighting's citation is its source; the other fields are the sighting's own. Its `vias` are the sources
// it passed through, from the one nearest the cited work to the one the contributor saw: a post that shows
// a page of the cited work, say.
export const CITATION_FIELDS = ['url', 'title', 'author', 'publisher', 'report_date'] as const
// The form sends each via as one value of each of these, repeated once per via and aligned by position.
export const VIA_INPUTS = ['via_url', 'via_title', 'via_author', 'via_publisher', 'via_report_date', 'via_quote'] as const
export const OCCURRENCE_FIELDS = ['place', 'original_date', 'page', 'context', 'style', 'types', 'note', 'quotes'] as const
export const SIGHTING_FIELDS = ['place', 'url', 'title', 'author', 'publisher', 'report_date', 'original_date', 'page', 'context', 'style', 'types', 'note', 'quotes'] as const
export const IMAGE_FIELDS = ['image_key', 'image_type', 'image_w', 'image_h', 'thumb_key', 'box'] as const

const clean = (raw: unknown, max: number) => {
  const value = String(raw ?? '').normalize('NFC').trim()
  return value ? value.slice(0, max) : null
}
const cleanLink = (raw: unknown) => {
  const value = clean(raw, 1000)
  return value && /^https?:\/\//i.test(value) ? cleanSourceUrl(value) : null
}
const text = (form: FormData, name: string, max: number) => clean(form.get(name), max)
// A link kept only when it is a web address, with its tracking parameters dropped.
const link = (form: FormData, name: string) => cleanLink(form.get(name))

const citationKey = (citation: Citation) => JSON.stringify(CITATION_FIELDS.map(field => citation[field]))
// The vias of a chain: rows with no field are dropped, a row that repeats an earlier one is dropped, and
// at most VIAS_MAX are kept. The quote stays with the link that carries it.
export const tidyVias = (vias: readonly Via[]): Via[] => {
  const seen = new Set<string>()
  return vias.filter(via => {
    const key = citationKey(via)
    if (CITATION_FIELDS.every(field => via[field] === null) || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, VIAS_MAX)
}
// Whether a sighting names a web address, as its source or in its chain.
export const hasLink = (fields: Pick<SightingFields, 'url' | 'vias'>) => Boolean(fields.url) || fields.vias.some(via => via.url)
// The vias a form sends, in the order of the page.
function readVias(form: FormData): Via[] {
  const columns = VIA_INPUTS.map(name => form.getAll(name))
  const rows = Math.max(...columns.map(column => column.length))
  return tidyVias(Array.from({ length: rows }, (_, index) => ({
    url: cleanLink(columns[0][index]),
    title: clean(columns[1][index], 300),
    author: clean(columns[2][index], 300),
    publisher: clean(columns[3][index], 300),
    report_date: dateText(columns[4][index]),
    quote: clean(columns[5][index], 5000),
  })))
}
const oneOf = (value: string | null, allowed: readonly string[]) => (value && allowed.includes(value) ? value : null)
const now = () => new Date().toISOString()

export function readEntryFields(form: FormData, tags: readonly Pick<Tag, 'name' | 'label'>[], base?: Partial<EntryFields>): { fields: EntryFields; error: ClaimError | null } {
  const named = form.has('script') ? resolveScript(String(form.get('script'))) : { script: base?.script ?? 'han', script_other: base?.script_other ?? null }
  const strokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
  const field = (name: 'description' | 'radical', max: number) => form.has(name) ? text(form, name, max) : base?.[name] ?? null
  const read = readClaims(form, tags, base?.claims)
  return {
    error: read.error,
    fields: {
      ...named,
      description: field('description', 20000),
      radical: field('radical', 20),
      strokes: form.has('strokes') ? (Number.isInteger(strokes) && strokes >= 0 && strokes < 200 ? strokes : null) : base?.strokes ?? null,
      claims: read.claims,
    },
  }
}

export function readSightingFields(form: FormData): SightingFields {
  const safeUrl = link(form, 'url')
  const locators = form.getAll('quote_locator')
  const texts = form.getAll('quote_text')
  if (texts.length > QUOTATIONS_MAX || locators.length > QUOTATIONS_MAX) error(400, 'Too many quotations')
  const quotes = texts.flatMap((value, i) => {
    const text = clean(value, 5000)?.replace(/[\uD800-\uDBFF]$/, '')
    return text ? [{ text, locator: clean(locators[i], 300) }] : []
  })
  const chosen = new Set(form.getAll('types').map(String))
  const types = SIGHTING_TYPES.filter(type => chosen.has(type))
  return {
    // A link alone answers where it was found.
    place: text(form, 'place', 500) ?? safeUrl ?? '',
    url: safeUrl,
    title: text(form, 'title', 300),
    author: text(form, 'author', 300),
    publisher: text(form, 'publisher', 300),
    report_date: dateText(form.get('report_date')),
    vias: readVias(form),
    original_date: dateText(form.get('original_date')),
    page: text(form, 'page', 80),
    context: oneOf(text(form, 'context', 20), CONTEXTS),
    style: oneOf(text(form, 'style', 20), STYLES),
    types: types.length ? JSON.stringify(types) : null,
    note: text(form, 'note', 5000),
    quotes: quotes.length ? JSON.stringify(quotes) : null,
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
  // A radical code point is a symbol to Unicode and a part here: it is read as the ideograph it stands for.
  return ([...value.normalize('NFKC').toLowerCase()].map(radicalEquivalent).join('').match(WORD) ?? []).filter(term => !/^[⿰-⿿]$/.test(term))
}

/** The marked works a record is in, in the order of the list. */
const marksHeld = (claims: readonly Claim[]) => { const held = registeredIn(encodingsOf(claims)); return MARKED.map(registry => registry.id).filter(id => held.has(id)) }
/** The marked works a stored summary names. */
export function parseMarks(raw: string | null | undefined): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    return Array.isArray(value) ? MARKED.map(registry => registry.id).filter(id => value.includes(id)) : []
  } catch { return [] }
}

type TagInput = Pick<Entry, 'script' | 'status' | 'description' | 'script_other'>
// A record's tag rows (`t:`) are written by `tagRows` from the tags and implications as its batch finds
// them, and are left out here.
export function facetTags(entry: Pick<Entry, 'script' | 'status' | 'ids' | 'cover_key' | 'radical' | 'first_year'>, hasSource: boolean, claims: readonly Claim[] = []) {
  const filters = entry.status ? [`f:${entry.status}`] : []
  if (!entry.cover_key) filters.push('n:image')
  if (!entry.ids) filters.push('n:ids')
  if (!hasSource) filters.push('n:source')
  const own = new Set<string>()
  for (const claim of claims) {
    if (claim.kind === 'collection') own.add(`c:${claim.value}`)
  }
  // A record is counted in or out of every marked work, so a list of either is one range.
  const held = marksHeld(claims)
  const marks = MARKED.map(registry => `${held.includes(registry.id) ? 'r' : 'x'}:${registry.id}`)
  // A record is listed under its radical's path and under every path above it, so a radical lists its
  // branches too. The path its stated radical names is kept apart (`b!`), since stating a radical makes it stand.
  const filing = fileRecord(entry.ids, entry.radical)
  const filed = [...pathsOf(filing?.path ?? []).map(path => `b:${path}`), ...(filing?.stated ? [`b!${filing.stated}`] : [])]
  // A record with a year is listed under its decade.
  const decade = entry.first_year === null ? [] : [`y:${Math.floor(Number(entry.first_year) / 10) * 10}`]
  return ['all', `s:${entry.script}`, ...filters, ...filters.map(filter => `s:${entry.script}|${filter}`), ...own, ...marks, ...filed, ...decade]
}

const WORD_KINDS = ['ids', 'reading', 'meaning', 'encoding', 'relation', 'ivd', 'tag']
function wordTags(entry: TagInput, claims: readonly Claim[], sightings: SightingFields[]) {
  const words = new Set<string>()
  const add = (value: unknown) => { if (typeof value === 'string') for (const term of terms(value)) words.add(term) }
  for (const field of ['description', 'script_other'] as const) add(entry[field])
  for (const claim of claims) if (WORD_KINDS.includes(claim.kind)) { add(claim.value); add(claim.data?.difference); add(claim.data?.evidence) }
  // A Unicode code is found by the character it names, which is what another site links with.
  for (const claim of claims) if (claim.kind === 'encoding' && claim.data?.charset === 'unicode') add(encodedCharacter(claim.value))
  for (const sighting of sightings) for (const field of ['place', 'title', 'author', 'publisher', 'note'] as const) add(sighting[field])
  for (const sighting of sightings) for (const quote of quotations(sighting.quotes)) { add(quote.text); add(quote.locator) }
  for (const sighting of sightings) for (const via of sighting.vias) for (const field of ['title', 'quote', 'author', 'publisher'] as const) add(via[field])
  return [...words].slice(0, WORDS_MAX).map(word => `w:${word}`)
}

/** The parts of a description: its characters other than the operators and spaces, radical code points as the ideographs they stand for. */
export const partsOf = (ids: string) => [...new Set([...ids].filter(char => !/[\s\u2FF0-\u2FFF\u31EF]/u.test(char)).map(radicalEquivalent))]
// A record is found by the parts of each description it states (`p:`), read by key like a word and kept the same way.
function partTags(claims: readonly Claim[]) {
  return [...new Set(claims.filter(claim => claim.kind === 'ids').flatMap(claim => partsOf(claim.value)))].map(part => `p:${part}`)
}

// The year a list is read by: a record's first year as a number, which keeps no leading zero.
const yearOf = (text: string | null) => text === null ? null : Number(text)

// A sighting's year: the work's own date when it is the earlier, else the date it was reported.
function sightingYear(sighting: Pick<SightingFields, 'report_date' | 'original_date'>, dates: DateBook) {
  const report = datedYear(sighting.report_date, dates), original = datedYear(sighting.original_date, dates)
  return original && (!report || original.n <= report.n) ? { ...original, kind: 'original' as const } : report ? { ...report, kind: 'report' as const } : null
}

// The earliest attestation among visible sightings, and the sighting that holds it: the first added
// of those that share its year.
export function earliestSighting<T extends Pick<SightingFields, 'report_date' | 'original_date'> & { id?: number; hidden_at?: string | null }>(sightings: T[], dates: DateBook = new Map()) {
  let found: { text: string; n: number; kind: YearKind; sighting: T } | null = null
  for (const sighting of sightings) {
    if (sighting.hidden_at) continue
    const year = sightingYear(sighting, dates)
    if (year && (!found || year.n < found.n)) found = { ...year, sighting }
  }
  return found
}

type SightingState = SightingFields & { media?: StoredImage[]; hidden_at?: string | null }

// What a tile shows of a record, read from its visible sightings: the cover, where it was seen, which
// source types it has and the earliest year among them. An older work in a recent post dates the
// sighting, not the post.
function summarize(sightings: SightingState[], dates: DateBook) {
  const visible = sightings.filter(sighting => !sighting.hidden_at)
  const cover = visible.find(sighting => sighting.media?.length)
  const types = new Set<SightingType>()
  for (const sighting of visible) for (const type of parseSightingTypes(sighting.types)) types.add(type)
  const year = earliestSighting(visible, dates)
  const added = visible.filter(sighting => !(sighting as { id?: number }).id)
  const held = (year?.sighting as { id?: number } | undefined)?.id
  // The sighting that holds the year: a stored one by its id, or one this write inserts, by how many of
  // the inserted ones follow it, counted back from the sightings sequence.
  const first: { id: number } | { after: number } | null = !year ? null : held ? { id: held } : { after: added.length - 1 - added.indexOf(year.sighting) }
  const chosen = SIGHTING_TYPES.filter(type => types.has(type))
  return {
    visible,
    cover_key: cover?.media?.[0].thumb_key ?? null,
    cover_place: (cover ?? visible[0])?.place ?? null,
    types: chosen.length ? JSON.stringify(chosen) : null,
    first_year: year?.text ?? null,
    first_year_kind: year?.kind ?? null,
    first,
    hasSource: visible.some(referenceComplete),
  }
}

const tagsOf = (entry: Entry, claims: readonly Claim[], summary: ReturnType<typeof summarize>) =>
  [...facetTags({ ...entry, status: statusOf(claims), ids: primaryIdsOf(claims), cover_key: summary.cover_key, first_year: summary.first_year }, summary.hasSource, claims), ...wordTags(entry, claims, summary.visible), ...partTags(claims)]
const TAG_ROWS = "tag >= 't:' AND tag < 't;'"
/**
 * A record's tag rows, written again from its claims, from whether it is live and from the tag
 * implications, all as the batch that runs these statements finds them, so neither an implication moved
 * nor a claim written meanwhile leaves them behind. They go after the record's claims and summary in
 * the batch. `owner` is as for `owned`.
 */
function tagRows(db: D1Database, owner: number | string) {
  const { sql, values } = owned(owner)
  return [
    db.prepare(`UPDATE tag_counts SET n = n - 1 WHERE tag IN (SELECT tag FROM entry_tags WHERE entry_id = ${sql} AND ${TAG_ROWS})`).bind(...values),
    db.prepare(`DELETE FROM entry_tags WHERE entry_id = ${sql} AND ${TAG_ROWS}`).bind(...values),
    db.prepare(`WITH RECURSIVE ${filedUnder(`= ${sql}`)} ${FILE_ROWS} WHERE e.merged_into IS NULL AND e.hidden_at IS NULL`).bind(...values),
    db.prepare(`INSERT INTO tag_counts(tag, n) SELECT tag, 1 FROM entry_tags WHERE entry_id = ${sql} AND ${TAG_ROWS} ON CONFLICT(tag) DO UPDATE SET n = n + 1`).bind(...values),
  ]
}
// Word and part rows are looked up by key and are no list of their own: they keep no count, year or tag count.
const facet = (tag: string) => !/^[wp]:/.test(tag)
const SIGHTING_SEQ = "(SELECT seq FROM sqlite_sequence WHERE name = 'sightings')"
// A summary names the sighting that holds the record's year by its id (1), or, for one the same write
// inserts, by how many inserted sightings follow it (2).
const SUMMARY_SET = `ids = ?, layout = ?, cover_key = ?, cover_place = ?, sightings = ?, types = ?, first_year = ?, first_year_kind = ?, marks = ?, status = ?, first_sighting = CASE ? WHEN 1 THEN ? WHEN 2 THEN ${SIGHTING_SEQ} - ? END`
const summaryValues = (claims: readonly Claim[], summary: ReturnType<typeof summarize>) => [primaryIdsOf(claims), layoutText(primaryLayoutOf(claims)) || null, summary.cover_key, summary.cover_place, summary.visible.length, summary.types, summary.first_year, summary.first_year_kind, marksHeld(claims).length ? JSON.stringify(marksHeld(claims)) : null, statusOf(claims), ...(!summary.first ? [0, 0, 0] : 'id' in summary.first ? [1, summary.first.id, 0] : [2, 0, summary.first.after])]

// Brings a record's tags, counts and summary up to date. It answers the statements, to run with the
// write they belong to.
async function reindex(db: D1Database, id: number, entry: Entry, claims: readonly Claim[], sightings: SightingState[], prepared?: DateBook) {
  const dates = await readDates(db, sightingDates(sightings))
  for (const [text, reading] of prepared ?? []) dates.set(text, reading)
  const summary = summarize(sightings, dates)
  const live = !entry.merged_into && !entry.hidden_at
  const next = live ? tagsOf(entry, claims, summary) : []
  const { results } = await db.prepare(`SELECT tag FROM entry_tags WHERE entry_id = ? AND NOT (${TAG_ROWS})`).bind(id).all<{ tag: string }>()
  const current = new Set(results.map(row => row.tag)), wanted = new Set(next)
  const gone = [...current].filter(tag => !wanted.has(tag)), added = [...wanted].filter(tag => !current.has(tag))
  return [
    db.prepare(`UPDATE entries SET ${SUMMARY_SET} WHERE id = ?`).bind(...summaryValues(claims, summary), id),
    db.prepare('DELETE FROM entry_tags WHERE entry_id = ? AND tag IN (SELECT value FROM json_each(?))').bind(id, JSON.stringify(gone)),
    db.prepare('INSERT OR IGNORE INTO entry_tags(tag, entry_id) SELECT value, ? FROM json_each(?)').bind(id, JSON.stringify(added)),
    // Word rows are only looked up by key, never read in order, so they keep no count.
    db.prepare("UPDATE entry_tags SET sightings = ?1, year = ?2 WHERE entry_id = ?3 AND (sightings != ?1 OR year IS NOT ?2) AND tag NOT GLOB '[wp]:*'").bind(summary.visible.length, yearOf(summary.first_year), id),
    db.prepare('UPDATE tag_counts SET n = n - 1 WHERE tag IN (SELECT value FROM json_each(?))').bind(JSON.stringify(gone.filter(facet))),
    db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(added.filter(facet))),
    ...tagRows(db, id),
  ]
}

// ---------- Claims, sources and pictures as statements ----------

const ENTRY_SEQ = "(SELECT seq FROM sqlite_sequence WHERE name = 'entries')"

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
async function citationOf(db: D1Database, values: (string | null)[], dates: DateBook) {
  if (values.every(value => value === null)) return { hash: null, statements: [] }
  const hash = await hashHex(JSON.stringify(values))
  const year = datedYear(values[CITATION_FIELDS.indexOf('report_date')], dates)?.n ?? null
  const publisher = values[CITATION_FIELDS.indexOf('publisher')]
  const key = publisher && nameKey(publisher)
  const statements = []
  if (publisher && key && nameLabel(publisher) !== publisher) {
    statements.push(db.prepare(`INSERT INTO publishers(name, lookup) SELECT ?1, ?2
      WHERE NOT EXISTS (SELECT 1 FROM publisher_aliases WHERE lookup = ?2) ON CONFLICT(lookup) DO NOTHING`)
      .bind(nameLabel(publisher), key))
  }
  const [url, title, author, imprint, date] = values
  const sourceName = sourceNameKey(title || url || author || imprint || date || '')
  statements.push(db.prepare(`INSERT INTO sources(hash, ${CITATION_FIELDS.join(', ')}, year, publisher_lookup, name_lookup) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING`).bind(hash, ...values, year, key || null, sourceName))
  return { hash, statements }
}
// The hash of the cited work, and the links of the chain with the words each quotes.
async function sourceOf(db: D1Database, fields: SightingFields, dates: DateBook) {
  const chain = tidyVias(fields.vias)
  const [work, ...vias] = await Promise.all([citationOf(db, CITATION_FIELDS.map(field => fields[field]), dates), ...chain.map(via => citationOf(db, CITATION_FIELDS.map(field => via[field]), dates))])
  return { hash: work.hash, vias: vias.flatMap((via, index) => via.hash === null ? [] : [{ hash: via.hash, quote: chain[index].quote }]), statements: [...work.statements, ...vias.flatMap(via => via.statements)] }
}
const SOURCE_ID = '(SELECT id FROM sources WHERE hash = ?)'
// The chain of a sighting as rows: position 0 is the via nearest the cited work.
function insertVias(db: D1Database, sighting: number | string, vias: readonly { hash: string; quote: string | null }[]) {
  const { sql, values } = owned(sighting)
  return db.prepare(`INSERT INTO sighting_vias(sighting_id, position, source_id, quote) SELECT ${sql}, CAST(j.key AS INTEGER), (SELECT id FROM sources WHERE hash = json_extract(j.value, '$.hash')), json_extract(j.value, '$.quote') FROM json_each(?) j`).bind(...values, JSON.stringify(vias))
}

const snapshotOf = <T extends object>(row: T, fields: readonly (keyof T)[]) => Object.fromEntries(fields.map(field => [field, row[field] ?? null]))
const entrySnapshot = (fields: EntryFields) => JSON.stringify({ ...snapshotOf(fields, ENTRY_FIELDS), claims: fields.claims })
const sightingSnapshot = (row: SightingFields, media: readonly StoredImage[]) => JSON.stringify({ ...snapshotOf(row, SIGHTING_FIELDS), vias: row.vias.map(via => ({ ...snapshotOf(via, CITATION_FIELDS), quote: via.quote ?? null })), media })

type Who = { actor: string; ip: string | null }
function revision(db: D1Database, who: Who, row: { entry: number; sighting?: number | null; kind: string; rev: number; snapshot: string; summary?: string | null }) {
  return db.prepare('INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at, ip_hash) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(row.entry, row.sighting ?? null, row.kind, row.rev, row.snapshot, row.summary ?? null, who.actor, now(), who.ip)
}

// ---------- Writes ----------

const OCCURRENCE_COLUMNS = OCCURRENCE_FIELDS.join(', ')
const OCCURRENCE_MARKS = OCCURRENCE_FIELDS.map(() => '?').join(', ')

export type SightingDraft = { fields: SightingFields; media: StoredImage[] }

// Counts again the visible records that cite each source a record's sightings cite, and the sources in
// `also`, which a sighting cited before this write. It runs after the write in the same batch.
const LIVE = 'e.hidden_at IS NULL AND e.merged_into IS NULL'
const CITING = `SELECT s.entry_id FROM sightings s INDEXED BY sightings_by_source CROSS JOIN entries e ON e.id = s.entry_id WHERE s.source_id = sources.id AND s.hidden_at IS NULL AND ${LIVE}`
const CITING_AS_VIA = `SELECT s.entry_id FROM sighting_vias v INDEXED BY sighting_vias_by_source CROSS JOIN sightings s ON s.id = v.sighting_id CROSS JOIN entries e ON e.id = s.entry_id WHERE v.source_id = sources.id AND s.hidden_at IS NULL AND ${LIVE}`
function recount(db: D1Database, entry: number | string, also: (number | null)[] = []) {
  const { sql, values } = owned(entry)
  return db.prepare(`UPDATE sources SET records = (SELECT count(*) FROM (${CITING} UNION ${CITING_AS_VIA})) WHERE id IN (SELECT source_id FROM sightings WHERE entry_id = ${sql} UNION SELECT v.source_id FROM sightings s CROSS JOIN sighting_vias v ON v.sighting_id = s.id WHERE s.entry_id = ${sql} UNION SELECT value FROM json_each(?))`)
    .bind(...values, ...values, JSON.stringify(also.filter(id => id !== null)))
}

// `more` are further sightings the record starts with. They go in the same batch as the record and its
// first sighting, so all of them are saved or none is. The sightings have no ids before this write, so a
// claim of `fields` names the ones that support it by their place among them: 1 is `sighting`, 2 the
// first of `more`.
export async function createEntry(db: D1Database, fields: EntryFields, sighting: SightingFields, media: StoredImage[], who: Who, more: SightingDraft[] = []) {
  return withDateIndex(db, async guard => {
    const at = now()
    const drafts = [{ fields: sighting, media }, ...more]
    const claims = mapSightings(fields.claims, place => Number.isInteger(place) && place >= 1 && place <= drafts.length ? place : null)
    const dates = await prepareDates(db, sightingDates(drafts.map(draft => draft.fields)))
    const sources = await Promise.all(drafts.map(draft => sourceOf(db, draft.fields, dates.book)))
    const summary = summarize(drafts.map(draft => ({ ...draft.fields, media: draft.media })), dates.book)
    await ensureTags(db, valuesOf(claims, 'tag'), who)
    const tags = [...new Set(tagsOf({ ...fields, merged_into: null, hidden_at: null } as unknown as Entry, claims, summary))]
    // AUTOINCREMENT sequences are read inside the same transaction as the inserts.
    const results = await db.batch<{ id: number }>([
      db.prepare(`INSERT INTO entries(${ENTRY_FIELDS.join(', ')}, created_by, created_at, updated_at) VALUES(${ENTRY_FIELDS.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`)
        .bind(...ENTRY_FIELDS.map(field => fields[field]), who.actor, at, at),
      guard,
      ...dates.save,
      insertClaims(db, ENTRY_SEQ, claims),
      db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${ENTRY_SEQ}, 'create', 1, ?, ?, ?, ?)`)
        .bind(entrySnapshot({ ...fields, claims }), who.actor, at, who.ip),
      ...drafts.flatMap((draft, index) => [
        ...sources[index].statements,
        db.prepare(`INSERT INTO sightings(entry_id, first_entry, source_id, ${OCCURRENCE_COLUMNS}, created_by, created_at, updated_at) VALUES(${ENTRY_SEQ}, ${ENTRY_SEQ}, ${SOURCE_ID}, ${OCCURRENCE_MARKS}, ?, ?, ?)`)
          .bind(sources[index].hash, ...OCCURRENCE_FIELDS.map(field => draft.fields[field]), who.actor, at, at),
        insertVias(db, SIGHTING_SEQ, sources[index].vias),
        insertMedia(db, SIGHTING_SEQ, draft.media),
        db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(${ENTRY_SEQ}, ${SIGHTING_SEQ}, 'sighting', 1, ?, ?, ?, ?)`)
          .bind(sightingSnapshot(draft.fields, draft.media), who.actor, at, who.ip),
      ]),
      ...(claims.some(claim => claim.sightings.length) ? [db.prepare(CITED_BY_PLACE), db.prepare(CITED_IN_SNAPSHOT)] : []),
      db.prepare(`UPDATE entries SET ${SUMMARY_SET} WHERE id = ${ENTRY_SEQ}`).bind(...summaryValues(claims, summary)),
      db.prepare(`INSERT INTO entry_tags(tag, entry_id, sightings, year) SELECT value, ${ENTRY_SEQ}, CASE WHEN value GLOB '[wp]:*' THEN 0 ELSE ? END, CASE WHEN value GLOB '[wp]:*' THEN NULL ELSE ? END FROM json_each(?)`).bind(summary.visible.length, yearOf(summary.first_year), JSON.stringify(tags)),
      db.prepare('INSERT INTO tag_counts(tag, n) SELECT value, 1 FROM json_each(?) WHERE true ON CONFLICT(tag) DO UPDATE SET n = n + 1').bind(JSON.stringify(tags.filter(facet))),
      ...tagRows(db, ENTRY_SEQ),
      recount(db, ENTRY_SEQ),
      ...dates.reindex,
    ])
    return results[0].results[0].id
  })
}

export type EditResult = { ok: true; rev: number } | { ok: false; code: 'missing' | 'conflict' | 'merged' }

const generation = '(SELECT generation FROM date_index_state)'
const markSql = `SELECT COALESCE(MAX(id), 0) + ${generation} AS mark FROM revisions WHERE entry_id = ?`
const revisionMark = async (db: D1Database, id: number) => (await db.prepare(markSql).bind(id).first<{ mark: number }>())!.mark
// Create and refresh have no edited revision to guard. Compare the date index inside their write batch.
async function withDateIndex<T>(db: D1Database, write: (guard: D1PreparedStatement) => Promise<T>): Promise<T> {
  const current = () => db.prepare('SELECT generation FROM date_index_state').first<{ generation: number }>()
  for (let attempt = 0; ; attempt++) {
    const version = (await current())!.generation
    const guard = db.prepare('UPDATE date_index_state SET generation = -1 WHERE generation != ?').bind(version)
    try { return await write(guard) }
    catch (error) {
      if (attempt >= 4 || (await current())!.generation === version) throw error
    }
  }
}
// A row of an unknown kind breaks the journal's CHECK, which undoes the whole batch.
const abort = "'conflict', 0, '{}'"
const checkMark = (db: D1Database, id: number, mark: number, who: Who) => db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE (${markSql}) != ?`).bind(id, who.actor, now(), id, mark)
const checkChanged = (db: D1Database, id: number, who: Who) => db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE changes() = 0`).bind(id, who.actor, now())

// A redaction writes to the journal, so one made after the mark is read stops the batch; this catches
// one made before it. `from` is the revision a restore copies.
const redacted = async (db: D1Database, from: number | null) => from !== null && Boolean(await db.prepare('SELECT 1 FROM revisions WHERE id = ? AND redacted_at IS NOT NULL').bind(from).first())

export async function editEntry(db: D1Database, id: number, baseRev: number, fields: EntryFields, who: Who, summary: string | null, kind: 'edit' | 'revert' = 'edit', from: number | null = null): Promise<EditResult> {
  await ensureTags(db, valuesOf(fields.claims, 'tag'), who)
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
  for (let attempt = 0; ; attempt++) {
    const mark = await revisionMark(db, id)
    const entry = await getEntryRow(db, id)
    if (!entry || entry.hidden_at || entry.merged_into) return null
    const sightings = await sightingRows(db, id)
    if (sightings.length >= SIGHTINGS_MAX) throw new SightingLimitError()
    const dates = await prepareDates(db, sightingDates([fields]))
    const source = await sourceOf(db, fields, dates.book)
    const index = await reindex(db, id, entry, await claimRows(db, id), [...sightings, { ...fields, media }], dates.book)
    const at = now()
    const before = [
      checkMark(db, id, mark, who),
      db.prepare(`INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) SELECT ?, ${abort}, ?, ? WHERE EXISTS (SELECT 1 FROM sightings WHERE entry_id = ? LIMIT 1 OFFSET ${SIGHTINGS_MAX - 1})`).bind(id, who.actor, at, id),
      ...dates.save,
      ...source.statements,
    ]
    try {
      const results = await db.batch<{ id: number }>([
        ...before,
        db.prepare(`INSERT INTO sightings(entry_id, first_entry, source_id, ${OCCURRENCE_COLUMNS}, created_by, created_at, updated_at) VALUES(?, ?, ${SOURCE_ID}, ${OCCURRENCE_MARKS}, ?, ?, ?) RETURNING id`)
          .bind(id, id, source.hash, ...OCCURRENCE_FIELDS.map(field => fields[field]), who.actor, at, at),
        insertVias(db, SIGHTING_SEQ, source.vias),
        insertMedia(db, SIGHTING_SEQ, media),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(at, id),
        db.prepare(`INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at, ip_hash) VALUES(?, ${SIGHTING_SEQ}, 'sighting', 1, ?, ?, ?, ?)`)
          .bind(id, sightingSnapshot(fields, media), who.actor, at, who.ip),
        ...index,
        recount(db, id),
        ...dates.reindex,
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
    const dates = await prepareDates(db, sightingDates([fields]))
    const source = await sourceOf(db, fields, dates.book)
    const index = await reindex(db, current.entry_id, entry, await claimRows(db, current.entry_id), sightings.map(s => s.id === id ? { ...s, ...fields, media: kept } : s), dates.book)
    try {
      await db.batch([
        checkMark(db, current.entry_id, mark, who),
        ...dates.save,
        ...source.statements,
        db.prepare(`UPDATE sightings SET source_id = ${SOURCE_ID}, ${OCCURRENCE_FIELDS.map(column => `${column} = ?`).join(', ')}, rev = ?, updated_at = ? WHERE id = ? AND entry_id = ? AND rev = ? AND hidden_at IS NULL AND EXISTS (SELECT 1 FROM entries WHERE id = sightings.entry_id AND hidden_at IS NULL AND merged_into IS NULL)`)
          .bind(source.hash, ...OCCURRENCE_FIELDS.map(field => fields[field]), rev, now(), id, current.entry_id, baseRev),
        checkChanged(db, current.entry_id, who),
        db.prepare('DELETE FROM sighting_vias WHERE sighting_id = ?').bind(id),
        insertVias(db, id, source.vias),
        // A source no sighting cites any more, as its work or as a via, is not kept.
        ...[...new Set([current.source_id, ...current.vias.map(via => via.id)])].filter(id => id !== null).map(id => db.prepare('DELETE FROM sources WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM sightings WHERE source_id = ?1) AND NOT EXISTS (SELECT 1 FROM sighting_vias WHERE source_id = ?1) AND NOT EXISTS (SELECT 1 FROM source_aliases WHERE source_id = ?1) AND NOT EXISTS (SELECT 1 FROM source_alias_changes WHERE source_id = ?1)').bind(id)),
        ...(media ? [db.prepare('DELETE FROM sighting_media WHERE sighting_id = ?').bind(id), insertMedia(db, id, media)] : []),
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(now(), current.entry_id),
        revision(db, who, { entry: current.entry_id, sighting: id, kind: 'sighting_edit', rev, snapshot: sightingSnapshot(fields, kept), summary }),
        ...index,
        recount(db, current.entry_id, [current.source_id, ...current.vias.map(via => via.id)]),
        ...dates.reindex,
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
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isScript(value.script)) return null
    for (const field of ['script_other', 'description', 'radical'] as const) if (typeof value[field] !== 'string' && value[field] != null) return null
    if (value.strokes != null && (!Number.isInteger(value.strokes) || value.strokes < 0 || value.strokes >= 200)) return null
    const claims = parseClaims(value.claims ?? [])
    if (!claims) return null
    return { script: value.script, script_other: value.script === 'other' ? value.script_other ?? null : null, description: value.description ?? null, radical: value.radical ?? null, strokes: value.strokes ?? null, claims }
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
    db.prepare('DELETE FROM date_readings WHERE transcription NOT IN (SELECT value FROM evidence_dates WHERE value IS NOT NULL)'),
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
    db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(now(), into),
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
    db.prepare('UPDATE entries SET merged_into = NULL, updated_at = ? WHERE id IN (?, ?)').bind(now(), id, into),
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
        // What the record's page shows changed, so its time of change moves too.
        db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').bind(now(), target.entry),
        checkChanged(db, target.entry, who),
        revision(db, who, { entry: target.entry, sighting: target.sighting, kind: hidden ? 'hide' : 'unhide', rev: 0, snapshot: '{}', summary }),
        ...index,
        recount(db, target.entry),
      ])
      return true
    } catch (error) {
      if (attempt < 4 && await revisionMark(db, target.entry) !== mark) continue
      throw error
    }
  }
}

/** Brings one record's tags, counts and summary up to date from what it holds. */
export async function refresh(db: D1Database, id: number) {
  await withDateIndex(db, async guard => {
    const entry = await getEntryRow(db, id)
    if (entry) await db.batch([guard, ...await reindex(db, id, entry, await claimRows(db, id), await sightingRows(db, id)), recount(db, id)])
  })
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
const CITATION_COLUMNS = CITATION_FIELDS.map(field => `c.${field}`).join(', ')
const CITATION = 'LEFT JOIN sources c ON c.id = s.source_id'

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
type ViaRow = Via & { id: number; sighting_id: number; position: number }
// A sighting's vias in chain order; the queries leave the order of a sighting's few rows to here.
function withVias<T extends { id: number }>(sightings: T[], vias: ViaRow[]) {
  const found = new Map<number, (Via & { id: number })[]>()
  for (const { sighting_id, position: _, ...via } of [...vias].sort((a, b) => a.sighting_id - b.sighting_id || a.position - b.position)) found.set(sighting_id, [...(found.get(sighting_id) ?? []), via])
  return sightings.map(sighting => ({ ...sighting, vias: found.get(sighting.id) ?? [] }))
}
const VIA_COLUMNS = `v.sighting_id, v.position, v.quote, v.source_id AS id, ${CITATION_FIELDS.map(field => `c.${field}`).join(', ')}`
// D1 bounds a statement to 100 parameters; a chain read names its sightings in chunks of this size.
const VIA_READ = 90
// The whole chains of the sightings named, read by the key of `sighting_vias` in one batch.
async function viasOfSightings(db: D1Database, ids: readonly number[]) {
  if (!ids.length) return []
  const chunks: number[][] = []
  for (let at = 0; at < ids.length; at += VIA_READ) chunks.push(ids.slice(at, at + VIA_READ))
  return (await db.batch(chunks.map(chunk => db.prepare(`SELECT ${VIA_COLUMNS} FROM sighting_vias v JOIN sources c ON c.id = v.source_id WHERE v.sighting_id IN (${chunk.map(() => '?').join(', ')}) ORDER BY v.sighting_id, v.position`).bind(...chunk)))).flatMap(result => result.results as ViaRow[])
}
// Only the sightings `sightingRows` reads, so a merged record past SIGHTINGS_MAX costs no more.
const VIAS_OF_ENTRY = `SELECT ${VIA_COLUMNS} FROM sightings s JOIN sighting_vias v ON v.sighting_id = s.id JOIN sources c ON c.id = v.source_id WHERE s.entry_id = ?1 AND s.id <= COALESCE((SELECT id FROM sightings WHERE entry_id = ?1 ORDER BY id LIMIT 1 OFFSET ${SIGHTINGS_MAX - 1}), ${Number.MAX_SAFE_INTEGER}) ORDER BY s.id`
const MEDIA_OF_ENTRY = `SELECT x.sighting_id, ${IMAGE_FIELDS.map(field => `x.${field}`).join(', ')} FROM sightings s JOIN sighting_media x ON x.sighting_id = s.id WHERE s.entry_id = ? ORDER BY x.sighting_id, x.position`

// A record's sightings, each with its citation and pictures.
async function sightingRows(db: D1Database, id: number, who = false) {
  const [rows, media, vias] = await db.batch<unknown>([
    db.prepare(`SELECT s.*, ${CITATION_COLUMNS}${who ? `, ${WHO_COLUMNS}` : ''} FROM sightings s ${CITATION} ${who ? WHO('s.created_by') : ''} WHERE s.entry_id = ? ORDER BY s.id LIMIT ${SIGHTINGS_MAX}`).bind(id),
    db.prepare(MEDIA_OF_ENTRY).bind(id),
    db.prepare(VIAS_OF_ENTRY).bind(id),
  ])
  return withVias(withMedia(rows.results as Omit<Sighting, 'media' | 'vias'>[], media.results as MediaRow[]), vias.results as ViaRow[]) as Sighting[]
}

const sightingRow = (db: D1Database, id: number) => db.prepare('SELECT id, entry_id, rev, hidden_at FROM sightings WHERE id = ?').bind(id).first<Pick<Sighting, 'id' | 'entry_id' | 'rev' | 'hidden_at'>>()

export async function getEntry(db: D1Database, id: number) {
  const entry = await db.prepare(`SELECT e.*, ${WHO_COLUMNS} FROM entries e ${WHO('e.created_by')} WHERE e.id = ?`).bind(id).first<Entry & { by_id: string; by_name: string }>()
  if (!entry) return null
  return { entry, claims: await claimRows(db, id), sightings: await sightingRows(db, id, true) }
}

export async function getSighting(db: D1Database, id: number) {
  const [row, media, vias] = await db.batch<unknown>([
    db.prepare(`SELECT s.*, ${CITATION_COLUMNS} FROM sightings s ${CITATION} WHERE s.id = ?`).bind(id),
    db.prepare(`SELECT sighting_id, ${IMAGE_FIELDS.join(', ')} FROM sighting_media WHERE sighting_id = ? ORDER BY position`).bind(id),
    db.prepare(`SELECT ${VIA_COLUMNS} FROM sighting_vias v JOIN sources c ON c.id = v.source_id WHERE v.sighting_id = ? ORDER BY v.position`).bind(id),
  ])
  return (withVias(withMedia(row.results as Omit<Sighting, 'media' | 'vias'>[], media.results as MediaRow[]), vias.results as ViaRow[])[0] as Sighting | undefined) ?? null
}

/** Whether a stored object belongs to a sighting anyone may see. */
export async function mediaVisible(db: D1Database, key: string) {
  const live = 'JOIN sightings s ON s.id = x.sighting_id JOIN entries e ON e.id = s.entry_id WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL'
  return Boolean(await db.prepare(`SELECT 1 FROM sighting_media x INDEXED BY sighting_media_by_image ${live} AND x.image_key = ?1 UNION ALL SELECT 1 FROM sighting_media x INDEXED BY sighting_media_by_thumb ${live} AND x.thumb_key = ?1 LIMIT 1`).bind(key).first())
}

export type Listing = { script?: string | null; filter?: string | null; facet?: string | null; radical?: string | null; decade?: string | null; within?: readonly string[]; without?: readonly string[]; query?: string | null; also?: readonly string[]; order?: Order; seed?: number | null; after?: string | null; limit?: number }
export const SEARCH_WINDOW = 256

// The one key a script and a filter name, or null for a filter that is not one.
export function listTag(script?: string | null, filter?: string | null) {
  const f = !filter ? null : (STATUSES as readonly string[]).includes(filter) ? `f:${filter}` : (NEEDS as readonly string[]).includes(filter as Need) ? `n:${filter}` : undefined
  if (f === undefined || (script && !isScript(script))) return null
  return script && f ? `s:${script}|${f}` : script ? `s:${script}` : f ?? 'all'
}

// A collection (`c:`) or a tag (`t:`), as the key it is listed under.
export function facetTag(facet?: string | null) {
  if (!facet) return null
  const match = /^([ct]):([^|\s]{1,40})$/u.exec(facet.normalize('NFC'))
  return match ? `${match[1]}:${match[2]}` : undefined
}

// A radical's path (`b:`), as the key its records and its branches' records are listed under.
export function radicalTag(radical?: string | null) {
  if (!radical) return null
  const path = parsePath(radical)
  return path ? `b:${path}` : undefined
}

// A decade, written as its first year (`1930`), as the key its records are listed under.
export function decadeTag(decade?: string | null) {
  if (!decade) return null
  return /^(0|[1-9]\d{0,2}0)$/.test(decade) ? `y:${decade}` : undefined
}

// The marked works a list keeps to (`r:`) and leaves out (`x:`), as the keys they are listed under, or
// null for a name that is no marked work.
export function markTags(within: readonly string[] = [], without: readonly string[] = []) {
  if (![...within, ...without].every(id => MARKED.some(registry => registry.id === id))) return null
  return [...new Set([...within.map(id => `r:${id}`), ...without.map(id => `x:${id}`)])]
}

export function exactSearchIds(query: string) {
  const ids = cleanIds(query)
  return isDescription(ids) ? ids : null
}

// Other spellings of the description searched for, found in the browser, are searched with it: at most
// ALSO_MAX, each a description of its own, none the query itself.
export const ALSO_MAX = 15
export function alsoSearchIds(query: string, values: readonly string[] = []) {
  const exact = exactSearchIds(query)
  if (!exact) return []
  return [...new Set(values.map(exactSearchIds).filter((ids): ids is string => ids !== null && ids !== exact))].slice(0, ALSO_MAX)
}

// A word that is one character may be a part of a description, and is found under the spellings of that part too.
const isPart = (term: string) => [...term].length === 1 && !/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Hangul}\p{N}]/u.test(term)
/** Parts IWDS counts as one with a part that are searched with it, at most. */
export const MATES_MAX = 2
// The part rows a part is found under: the ideograph its radical code point stands for, then the parts IWDS counts as one with it.
const partRows = (part: string) => { const own = radicalEquivalent(part); return [...new Set([own, ...groupMates(own).slice(0, MATES_MAX).map(radicalEquivalent)])].map(spelling => `p:${spelling}`) }

/** The parts of a query that is parts alone, such as 艹時, or null for a description or a query with a longer word. */
export function searchParts(query: string) {
  if (exactSearchIds(query)) return null
  const parts = [...new Set(terms(query))]
  return parts.length && parts.length <= SEARCH_TERMS_MAX && parts.every(isPart) ? parts : null
}

// Other spellings of the parts searched for, found in the browser, are searched with them: at most
// PART_ALSO_MAX runs of at most PART_RUN_MAX parts, none the parts of the query itself.
export const PART_ALSO_MAX = PART_SPELLINGS_MAX - 1
export function alsoSearchParts(query: string, values: readonly string[] = []) {
  const typed = searchParts(query)
  if (!typed) return []
  const seen = new Set([[...typed].sort().join('')]), runs: string[] = []
  for (const value of values) {
    const parts = [...new Set(terms(value))], key = [...parts].sort().join('')
    if (!parts.length || parts.length > PART_RUN_MAX || !parts.every(isPart) || parts.join('') !== [...new Set([...value.normalize('NFKC')].map(radicalEquivalent))].join('') || seen.has(key)) continue
    seen.add(key)
    runs.push(parts.join(''))
  }
  return runs.slice(0, PART_ALSO_MAX)
}

/** The other spellings a search is made under: of a whole description, or of a query that is parts alone. */
export const alsoSearch = (query: string, values: readonly string[] = []) => exactSearchIds(query) ? alsoSearchIds(query, values) : alsoSearchParts(query, values)

// The keys every row of a listing holds and the words it is searched for. Each word is the rows any of which
// holds it; `spelt` are the other spellings of a query of parts, each the rows of its parts. Null names a listing that is not one.
function listPlan({ script, filter, facet, radical, decade, within, without, query, also }: Listing) {
  const base = listTag(script, filter), own = facetTag(facet), filed = radicalTag(radical), period = decadeTag(decade), marks = markTags(within, without)
  if (!base || own === undefined || filed === undefined || period === undefined || !marks) return null
  if ((query?.trim().length ?? 0) > SEARCH_LENGTH_MAX) return null
  const typed = exactSearchIds(query ?? '')
  const exact = typed ? [typed, ...alsoSearchIds(query ?? '', also)] : null
  const words = exact ? [] : [...new Set(terms(query ?? ''))]
  if (!exact && (words.length > SEARCH_TERMS_MAX || (query?.trim() && !words.length))) return null
  const keys = [...(own ? [own] : []), ...(filed ? [filed] : []), ...(period ? [period] : []), ...marks, ...(base !== 'all' ? [base] : [])]
  const spelt = exact ? [] : alsoSearchParts(query ?? '', also).map(run => [...run].map(partRows))
  return { keys, exact, words: words.map(word => [`w:${word}`, ...(isPart(word) ? partRows(word) : [])]), spelt }
}
type Plan = NonNullable<ReturnType<typeof listPlan>>

// Whether a row of `from` holds the words: every word of the query, or every part of another spelling of it.
// `given` is a word the rows read are known to hold.
function wordsTest(plan: Plan, from: 't' | 'd', given?: readonly string[]) {
  const held = (rows: readonly string[]) => `EXISTS (SELECT 1 FROM entry_tags w WHERE w.tag ${rows.length === 1 ? '= ?' : `IN (${rows.map(() => '?')})`} AND w.entry_id = ${from}.entry_id)`
  const spellings = [plan.words.filter(rows => rows !== given), ...plan.spelt].filter(words => words.length)
  const tests = spellings.map(words => words.map(held).join(' AND '))
  return { tests: tests.length > 1 ? [`(${tests.map(test => `(${test})`).join(' OR ')})`] : tests, values: spellings.flat(2) }
}

// One key is the range read and the others are tested on each row of it, with the words.
function listRead(plan: Plan, range = plan.keys[0] ?? 'all') {
  const words = wordsTest(plan, 't'), keys = plan.keys.filter(key => key !== range)
  const tests = [...words.tests, ...keys.map(() => 'EXISTS (SELECT 1 FROM entry_tags w WHERE w.tag = ? AND w.entry_id = t.entry_id)')]
  return { tag: range, tests, values: [...words.values, ...keys], searching: plan.exact !== null || tests.length > 0 }
}

export const TILE_COLUMNS = 'e.id, e.ids, e.layout, e.cover_key, e.sightings, e.status, e.types, e.first_year, e.first_year_kind, e.marks'

// Where each order reads its range, and the place a cursor names in it: the record alone for the orders
// by record, the count and the record for the orders by count. Null names a cursor that is not one.
// The order indexes leave out word and part rows, which are only looked up by key; a read names that so it may use them.
const LISTED = "t.tag NOT GLOB '[wp]:*'"
// A shuffled list reads by rank from its seed to the end, then from 0 to the seed. The expression is the
// one migration 0013 indexes, so it must stay the same character for character.
const MIXED = '(((t.entry_id % 4294967296) * 1540483477) % 4294967296)'
const FOLDED = `((${MIXED} | (${MIXED} >> 16)) - (${MIXED} & (${MIXED} >> 16)))`
const RANK = `((${FOLDED} * 73244475) % 4294967296)`
// The orders by year read only the records that have one.
const ORDER_READS: Record<Exclude<Order, 'random'>, { by: string; past: string; counted: boolean; key: string }> = {
  new: { by: 't.entry_id DESC', past: 't.entry_id < ?', counted: false, key: 't.sightings' },
  old: { by: 't.entry_id', past: 't.entry_id > ?', counted: false, key: 't.sightings' },
  most: { by: 't.sightings DESC, t.entry_id DESC', past: `(t.sightings, t.entry_id) < (?, ?) AND ${LISTED}`, counted: true, key: 't.sightings' },
  fewest: { by: 't.sightings, t.entry_id', past: `(t.sightings, t.entry_id) > (?, ?) AND ${LISTED}`, counted: true, key: 't.sightings' },
  earliest: { by: 't.year, t.entry_id', past: `(t.year, t.entry_id) > (?, ?) AND t.year IS NOT NULL AND ${LISTED}`, counted: true, key: 't.year' },
  latest: { by: 't.year DESC, t.entry_id DESC', past: `(t.year, t.entry_id) < (?, ?) AND t.year IS NOT NULL AND ${LISTED}`, counted: true, key: 't.year' },
}
const ID = /^[1-9]\d{0,15}$/, COUNT = /^(0|[1-9]\d{0,8})$/
export function cursorOf(order: Order, after: string | null | undefined): number[] | null | undefined {
  if (order === 'random') return after === null || after === undefined ? [] : seedOf(after) === null ? null : [Number(after)]
  const descending = order === 'new' || order === 'most' || order === 'latest'
  if (after === null || after === undefined) return ORDER_READS[order].counted ? (descending ? [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] : [-1, 0]) : [descending ? Number.MAX_SAFE_INTEGER : 0]
  const parts = after.split('.')
  if (ORDER_READS[order].counted ? parts.length !== 2 || !COUNT.test(parts[0]) || !ID.test(parts[1]) : parts.length !== 1 || !ID.test(parts[0])) return null
  return parts.map(Number)
}
const cursorAt = (order: Order, row: { id: number; counted: number }) => order === 'random' || !ORDER_READS[order].counted ? String(order === 'random' ? row.counted : row.id) : `${row.counted}.${row.id}`

// The rank ranges a shuffled list has left to read, [from, to) each, after the rank a cursor names.
export function shuffleRanges(seed: number, after: number | null): [number, number][] {
  const ranges: [number, number][] = after === null ? [[seed, SEEDS], [0, seed]] : after >= seed ? [[after + 1, SEEDS], [0, seed]] : [[after + 1, seed]]
  return ranges.filter(([from, to]) => from < to)
}

// `range` names the key to read; without it the first key is read. A shuffled list may need a second
// read once the first reaches the end of the ranks: `part` names it, and `taken` the rows the first gave.
export function listStatement(db: D1Database, listing: Listing, range?: string, part = 0, taken = 0) {
  const plan = listPlan(listing)
  const order = listing.order ?? ORDER, cursor = cursorOf(order, listing.after)
  if (!plan || !cursor) return null
  const ranks = order === 'random' ? listing.seed === null || listing.seed === undefined ? null : shuffleRanges(listing.seed, cursor[0] ?? null)[part] ?? null : part ? null : undefined
  if (ranks === null) return null
  const read = listRead(plan, range)
  // The range drives the query. Tests are projections, not filters:
  // LIMIT therefore bounds candidates read even when no row passes.
  const tests = [
    ...(plan.exact ? [`EXISTS (SELECT 1 FROM claims k WHERE k.kind = 'ids' AND k.value IN (${plan.exact.map(() => '?')}) AND k.entry_id = t.entry_id)`] : []),
    ...read.tests,
  ].join(' AND ') || '1'
  const { by, past, key } = order === 'random' ? { by: RANK, past: `${RANK} >= ? AND ${RANK} < ? AND ${LISTED}`, key: RANK } : ORDER_READS[order]
  return db.prepare(`SELECT ${TILE_COLUMNS}, ${key} AS counted, (${tests}) AS matches FROM entry_tags t CROSS JOIN entries e ON e.id = t.entry_id WHERE t.tag = ? AND ${past} ORDER BY ${by} LIMIT ?`)
    .bind(...(plan.exact ?? []), ...read.values, read.tag, ...(ranks ?? cursor), (read.searching ? SEARCH_WINDOW : listing.limit ?? PAGE) + 1 - taken)
}

export type TileRow = Pick<Entry, 'id' | 'ids' | 'layout' | 'cover_key' | 'sightings' | 'status' | 'types' | 'first_year' | 'first_year_kind' | 'marks'>
export type Tile = Pick<Entry, 'id' | 'ids' | 'layout' | 'cover_key' | 'sightings' | 'status'> & { types: SightingType[]; firstYear: string | null; firstYearKind: YearKind | null; marks: string[] }
export const toTile = ({ types, first_year, first_year_kind, marks, ...row }: TileRow): Tile => ({ ...row, types: parseSightingTypes(types), firstYear: first_year, firstYearKind: first_year_kind, marks: parseMarks(marks) })

export async function list(db: D1Database, listing: Listing) {
  const plan = listPlan(listing)
  if (!plan || !cursorOf(listing.order ?? ORDER, listing.after) || (listing.order === 'random' && (listing.seed ?? null) === null)) return null
  // Of several keys the one with the fewest records is read, so a short list is not sought in a long one.
  let range: string | undefined
  if (plan.keys.length > 1) {
    const { results } = await db.prepare('SELECT tag, n FROM tag_counts WHERE tag IN (SELECT value FROM json_each(?))').bind(JSON.stringify(plan.keys)).all<{ tag: string; n: number }>()
    const sizes = new Map(results.map(row => [row.tag, row.n]))
    range = plan.keys.reduce((least, key) => (sizes.get(key) ?? 0) < (sizes.get(least) ?? 0) ? key : least)
  }
  const read = listRead(plan, range)
  const limit = listing.limit ?? PAGE
  const window = read.searching ? SEARCH_WINDOW : limit
  const results: (TileRow & { counted: number; matches: number })[] = []
  for (let part = 0; results.length <= window; part++) {
    const statement = listStatement(db, listing, range, part, results.length)
    if (!statement) break
    results.push(...(await statement.all<TileRow & { counted: number; matches: number }>()).results)
  }
  const tiles: Tile[] = []
  let consumed = 0
  for (const { matches, counted: _, ...row } of results.slice(0, window)) {
    consumed++
    if (matches) tiles.push(toTile(row))
    if (tiles.length === limit) break
  }
  const next = consumed < results.length ? cursorAt(listing.order ?? ORDER, results[consumed - 1]) : null
  return { tiles, next, partial: read.searching && next !== null && tiles.length < limit, read: consumed }
}

// A search is counted once, from the shortest range it is tested against: a key, a word or the exact
// description. A query of parts with other spellings is counted from one word of each spelling, since a
// record found holds every word of one of them. At most TOTAL_READ records of that range are read; past
// that the count is a floor.
export const TOTAL_READ = 1000
type TotalRange = { tag: string; exact?: undefined; words?: undefined } | { tag?: undefined; exact: readonly string[]; words?: undefined } | { tag?: undefined; exact?: undefined; words: readonly string[] }
const rowsIn = (rows: number) => rows === 1 ? '= ?' : `IN (${Array(rows).fill('?')})`
export const wordSize = (rows: number) => `SELECT count(*) AS n FROM (SELECT 1 FROM entry_tags WHERE tag ${rowsIn(rows)} LIMIT ${TOTAL_READ + 1})`
export const exactSize = (spellings: number) => `SELECT count(*) AS n FROM (SELECT entry_id FROM claims WHERE kind = 'ids' AND value IN (${Array(spellings).fill('?')}) LIMIT ${TOTAL_READ + 1})`
export function totalStatement(db: D1Database, listing: Listing, from: TotalRange) {
  const plan = listPlan(listing)
  if (!plan) return null
  const tags = (plan.keys.length ? plan.keys : ['all']).filter(tag => tag !== from.tag)
  const exact = from.exact ? null : plan.exact
  // The rows of one word read alone are known to hold it, unless another spelling could do without it.
  const read = from.exact ?? from.words ?? [from.tag]
  const given = from.words && !plan.spelt.length ? plan.words.find(rows => rows.length === read.length && rows.every((row, i) => row === read[i])) : undefined
  const words = wordsTest(plan, 'd', given)
  const tests = [
    ...(exact ? [`EXISTS (SELECT 1 FROM claims k WHERE k.kind = 'ids' AND k.value IN (${exact.map(() => '?')}) AND k.entry_id = d.entry_id)`] : []),
    ...words.tests,
    ...tags.map(() => 'EXISTS (SELECT 1 FROM entry_tags w WHERE w.tag = ? AND w.entry_id = d.entry_id)'),
  ].join(' AND ') || '1'
  // Several spellings or rows are read unordered and each record counted once, since none of them is one range of the index.
  const range = from.exact
    ? `SELECT entry_id FROM claims WHERE kind = 'ids' AND value IN (${from.exact.map(() => '?')}) LIMIT ${TOTAL_READ}`
    : read.length > 1 ? `SELECT entry_id FROM entry_tags WHERE tag ${rowsIn(read.length)} LIMIT ${TOTAL_READ}`
    : `SELECT entry_id FROM entry_tags WHERE tag = ? ORDER BY entry_id LIMIT ${TOTAL_READ}`
  // A tag range holds each record once; only several spellings or rows can name one record twice.
  return db.prepare(`SELECT ${read.length > 1 ? 'count(DISTINCT d.entry_id)' : 'count(*)'} AS n FROM (${range}) d WHERE ${tests}`)
    .bind(...read, ...(exact ?? []), ...words.values, ...tags)
}

// How many records a search finds, and how many it looks through: the shortest of its keys, which `list`
// reads. Null for a listing that is no search.
export async function searchTotal(db: D1Database, listing: Listing): Promise<{ n: number; floor: boolean; pool: number } | null> {
  const plan = listPlan(listing)
  const keys = plan?.keys.length ? plan.keys : ['all']
  if (!plan || (!plan.exact && !plan.words.length && keys.length < 2)) return null
  const spellings = [plan.words, ...plan.spelt].filter(spelling => spelling.length), words = spellings.flat()
  const [known, ...read] = await db.batch<{ tag: string; n: number }>([
    db.prepare('SELECT tag, n FROM tag_counts WHERE tag IN (SELECT value FROM json_each(?))').bind(JSON.stringify(keys)),
    ...words.map(rows => db.prepare(wordSize(rows.length)).bind(...rows)),
    ...(plan.exact ? [db.prepare(exactSize(plan.exact.length)).bind(...plan.exact)] : []),
  ])
  const sizes = new Map(known.results.map(row => [row.tag, row.n]))
  const sized = new Map(words.map((rows, i) => [rows, read[i].results[0]?.n ?? 0]))
  // The least word of each spelling: together they hold every record the words find.
  const least = spellings.map(spelling => spelling.reduce((least, rows) => sized.get(rows)! < sized.get(least)! ? rows : least))
  const ranges: (TotalRange & { size: number })[] = [
    ...keys.map(tag => ({ tag, size: sizes.get(tag) ?? 0 })),
    ...(spellings.length > 1 ? [{ words: [...new Set(least.flat())], size: least.reduce((sum, rows) => sum + sized.get(rows)!, 0) }] : plan.words.map(rows => ({ words: rows, size: sized.get(rows)! }))),
    ...(plan.exact ? [{ exact: plan.exact, size: read[words.length].results[0]?.n ?? 0 }] : []),
  ]
  const from = ranges.reduce((least, range) => range.size < least.size ? range : least)
  const pool = Math.min(...keys.map(tag => sizes.get(tag) ?? 0))
  if (!from.size) return { n: 0, floor: false, pool }
  const counted = await totalStatement(db, listing, from)!.first<{ n: number }>()
  return { n: counted?.n ?? 0, floor: from.size > TOTAL_READ, pool }
}

// The chronology (年表): every dated record in the order of its earliest year, each with the evidence
// that holds that year, read from a place in the year index on. A place is a year and a record, and a
// page starts at its own first row. The decades and their counts come from the counts kept with each write.
export const CHRONICLE_PAGE = 100
export const decadeCountsStatement = (db: D1Database) => db.prepare("SELECT tag, n FROM tag_counts WHERE tag >= 'y:' AND tag < 'y;' AND n > 0")
const CHRONICLE_COLUMNS = `${TILE_COLUMNS}, t.year AS year, s.id AS s_id, s.place AS s_place, s.original_date AS s_original, c.title AS c_title, c.author AS c_author, c.report_date AS c_report`
const CHRONICLE_FROM = `entry_tags t CROSS JOIN entries e ON e.id = t.entry_id LEFT JOIN sightings s ON s.id = e.first_sighting LEFT JOIN sources c ON c.id = s.source_id`
const CHRONICLE_DATED = `t.tag = 'all' AND t.year IS NOT NULL AND ${LISTED}`
// A page is read forwards from a place, inclusive, or backwards from just before one; both read one row
// past the page, to know whether more lie that way.
export const chronicleStatement = (db: D1Database, at: [number, number], limit = CHRONICLE_PAGE + 1) =>
  db.prepare(`SELECT ${CHRONICLE_COLUMNS} FROM ${CHRONICLE_FROM} WHERE ${CHRONICLE_DATED} AND (t.year, t.entry_id) >= (?, ?) ORDER BY t.year, t.entry_id LIMIT ?`).bind(at[0], at[1], limit)
export const chronicleBackStatement = (db: D1Database, before: [number, number], limit = CHRONICLE_PAGE + 1) =>
  db.prepare(`SELECT ${CHRONICLE_COLUMNS} FROM ${CHRONICLE_FROM} WHERE ${CHRONICLE_DATED} AND (t.year, t.entry_id) < (?, ?) ORDER BY t.year DESC, t.entry_id DESC LIMIT ?`).bind(before[0], before[1], limit)

type ChronicleRow = TileRow & { year: number; s_id: number | null; s_place: string | null; s_original: string | null; c_title: string | null; c_author: string | null; c_report: string | null }
export type ChronicleEntry = { year: number; tile: Tile; sighting: { id: number; place: string | null; title: string | null; author: string | null; date: string | null; vias: (Via & { id: number })[] } | null }
export type ChroniclePlace = { at: [number, number] } | { before: [number, number] }
const placeOf = (row: { year: number; id: number }) => `${row.year}.${row.id}`
const toEntry = ({ year, s_id, s_place, s_original, c_title, c_author, c_report, ...tile }: ChronicleRow): ChronicleEntry => ({
  year,
  tile: toTile(tile),
  // The date the year was read from: the work's own when it gave the year, else the report's.
  sighting: s_id === null ? null : { id: s_id, place: s_place, title: c_title, author: c_author, date: tile.first_year_kind === 'original' ? s_original : c_report, vias: [] },
})

// Each page links to the page just before its first row and the page from the row after its last, so
// going back and forth returns to the same rows.
export async function chronology(db: D1Database, place: ChroniclePlace) {
  const forward = 'at' in place
  const edge = forward ? place.at : place.before
  const [counts, total, read, across] = await db.batch<Record<string, unknown>>([
    decadeCountsStatement(db),
    db.prepare("SELECT n FROM tag_counts WHERE tag = 'all'"),
    forward ? chronicleStatement(db, edge) : chronicleBackStatement(db, edge),
    // Whether anything lies on the other side of the place the page was read from.
    forward ? chronicleBackStatement(db, edge, 1) : chronicleStatement(db, edge, 1),
  ])
  const counted = counts.results as { tag: string; n: number }[], rows = read.results as ChronicleRow[], other = across.results as ChronicleRow[]
  const all = (total.results as { n: number }[])[0]
  const decades = counted.map(row => ({ decade: Number(row.tag.slice(2)), n: row.n })).sort((a, b) => a.decade - b.decade)
  const dated = decades.reduce((sum, row) => sum + row.n, 0)
  const shown = rows.slice(0, CHRONICLE_PAGE)
  if (!forward) shown.reverse()
  const more = rows.length > CHRONICLE_PAGE
  const first = shown[0], last = shown.at(-1)
  const entries = shown.map(toEntry)
  const sightings = entries.flatMap(entry => entry.sighting ? [entry.sighting] : [])
  const chains = new Map(withVias(sightings, await viasOfSightings(db, sightings.map(sighting => sighting.id))).map(sighting => [sighting.id, sighting.vias]))
  return {
    decades,
    entries: entries.map(entry => entry.sighting ? { ...entry, sighting: { ...entry.sighting, vias: chains.get(entry.sighting.id) ?? [] } } : entry),
    earlier: first && (forward ? other.length > 0 : more) ? `before=${placeOf(first)}` : null,
    later: forward ? (more ? `at=${placeOf(rows[CHRONICLE_PAGE])}` : null) : last && other.length ? `at=${placeOf(other[0])}` : null,
    dated,
    undated: Math.max(0, (all?.n ?? 0) - dated),
  }
}

// A place in the chronology: from `year.record` on (?at=), the rows before one (?before=), or a decade's start.
export function chroniclePlace(at: string | null, before: string | null, from: string | null): ChroniclePlace | undefined {
  const parse = (text: string) => { const match = /^(0|[1-9]\d{0,8})\.([1-9]\d{0,15})$/.exec(text); return match ? [Number(match[1]), Number(match[2])] as [number, number] : undefined }
  if (at !== null) { const found = parse(at); return found && { at: found } }
  if (before !== null) { const found = parse(before); return found && { before: found } }
  if (from !== null) return /^(0|[1-9]\d{0,2}0)$/.test(from) ? { at: [Number(from), 0] } : undefined
  return { at: [-1, 0] }
}

// The counts a page shows beside its filters. Tags are counted too, and read where they are listed. The
// radical paths (`b!`, `b:`) are stepped over by key, so the read does not grow with them.
export const countsStatement = (db: D1Database) => db.prepare(`SELECT tag, n FROM tag_counts WHERE (tag < 'b!' OR tag >= 'b;') AND n > 0 AND tag NOT LIKE '%|%' AND tag NOT LIKE 't:%'`)
export async function counts(db: D1Database) {
  const { results } = await countsStatement(db).all<{ tag: string; n: number }>()
  return Object.fromEntries(results.map(row => [row.tag, row.n])) as Record<string, number>
}

// The records each radical path holds, for the paths that can stand as a radical: a Kangxi radical in
// use, any path with enough records and any path a record states. `under` keeps the read to one radical
// and its branches. The paths with enough records are one range of `tag_counts_branches`, the stated
// paths one range of the counts, and the rest is read by key, so the read does not grow with the paths
// that hold fewer and that no record states.
export function radicalCountsStatement(db: D1Database, under?: string) {
  const from = `b:${under ?? ''}`, to = under ? `${from}\u{10FFFF}` : 'b;'
  const stated = `b!${under ?? ''}`, statedTo = under ? `${stated}\u{10FFFF}` : 'b"'
  return db.prepare(`SELECT 0 AS stated, substr(tag, 3) AS path, n FROM tag_counts INDEXED BY tag_counts_branches WHERE tag >= ?1 AND tag < ?2 AND n >= ${BRANCH_MIN}
    UNION ALL SELECT 0, substr(tag, 3), n FROM tag_counts WHERE tag IN (SELECT 'b:' || value FROM json_each(?3)) AND n > 0 AND n < ${BRANCH_MIN}
    UNION ALL SELECT 0, substr(t.tag, 3), t.n FROM tag_counts d CROSS JOIN tag_counts t ON t.tag = 'b:' || substr(d.tag, 3) WHERE d.tag >= ?4 AND d.tag < ?5 AND d.n > 0 AND t.n > 0 AND t.n < ${BRANCH_MIN}
    UNION ALL SELECT 1, substr(tag, 3), n FROM tag_counts WHERE tag >= ?4 AND tag < ?5 AND n > 0`).bind(from, to, JSON.stringify(under ? [under] : KANGXI), stated, statedTo)
}
export async function radicalCounts(db: D1Database, under?: string) {
  const { results } = await radicalCountsStatement(db, under).all<{ stated: number; path: string; n: number }>()
  return { counts: new Map(results.filter(row => !row.stated).map(row => [row.path, row.n])), stated: new Set(results.filter(row => row.stated).map(row => row.path)) }
}

export const TAGS_MAX = 200
export async function tagCounts(db: D1Database) {
  const { results } = await db.prepare(`SELECT substr(tag, 3) AS tag, n FROM tag_counts WHERE tag >= 't:' AND tag < 't;' AND n > 0 ORDER BY n DESC, tag LIMIT ${TAGS_MAX}`).all<{ tag: string; n: number }>()
  return results
}

export type Source = { id: number; url: string | null; title: string | null; author: string | null; publisher: string | null; report_date: string | null }

export const getVisibleSource = (db: D1Database, id: number) => db.prepare(`
  SELECT id, ${CITATION_FIELDS.join(', ')} FROM sources
  WHERE id = ? AND (EXISTS (${CITING}) OR EXISTS (${CITING_AS_VIA}))
`).bind(id).first<Source>()

/** A picture as a social card crops it: the file, its thumbnail, its size and the characters marked on it. */
export type CardPicture = Pick<StoredImage, 'image_key' | 'thumb_key' | 'image_w' | 'image_h' | 'box'>
const CARD_PICTURE = 'x.image_key, x.thumb_key, x.image_w, x.image_h, x.box'

// A record's cover, by its thumbnail, while a visible sighting still shows it.
export const getCoverPicture = (db: D1Database, thumbKey: string) => db.prepare(`
  SELECT ${CARD_PICTURE} FROM sighting_media x INDEXED BY sighting_media_by_thumb
  JOIN sightings s ON s.id = x.sighting_id JOIN entries e ON e.id = s.entry_id
  WHERE x.thumb_key = ? AND s.hidden_at IS NULL AND ${LIVE}
  LIMIT 1
`).bind(thumbKey).first<CardPicture>()

// A source's cover comes from a visible sighting that cites the work itself.
export const getSourceArtwork = (db: D1Database, id: number) => db.prepare(`
  SELECT ${CARD_PICTURE} FROM sightings s INDEXED BY sightings_by_source
  CROSS JOIN entries e ON e.id = s.entry_id
  JOIN sighting_media x ON x.sighting_id = s.id
  WHERE s.source_id = ? AND s.hidden_at IS NULL AND ${LIVE}
  ORDER BY s.id, x.position
  LIMIT 1
`).bind(id).first<CardPicture>()

export const SOURCE_PAGE = 200

// A source and the records seen in it, each once, with the pages it was seen on.
export type SourceSighting = Pick<Sighting, 'id' | 'entry_id' | 'place' | 'original_date' | 'page' | 'context' | 'style' | 'note' | 'quotes' | 'media'> & { types: SightingType[]; tile: Tile; via: boolean; vias: (Via & { id: number })[] }
const SOURCE_SIGHTING = ['place', 'original_date', 'page', 'context', 'style', 'types', 'note', 'quotes'].map(field => `s.${field} AS s_${field}`).join(', ')

// A source with the visible sightings that cite it, each with its pictures and the record it belongs to:
// first those that cite it as their work, then those found through it. A sighting that cites one source
// both ways is listed once, as its work.
export async function sourcePage(db: D1Database, id: number) {
  // Found through a source: its rows of `sighting_vias`, in the order of their sightings. A sighting that
  // cites the source as its work too is left to the first way.
  const direct = { from: 'sightings s INDEXED BY sightings_by_source CROSS JOIN entries e ON e.id = s.entry_id', live: 's.source_id = ?', order: 's.id' }
  const via = { from: 'sighting_vias v INDEXED BY sighting_vias_by_source CROSS JOIN sightings s ON s.id = v.sighting_id CROSS JOIN entries e ON e.id = s.entry_id', live: 'v.source_id = ? AND s.source_id IS NOT v.source_id', order: 'v.sighting_id' }
  const live = (way: typeof direct) => `${way.live} AND s.hidden_at IS NULL AND ${LIVE}`
  const [found, ...queries] = await db.batch<unknown>([
    db.prepare(`SELECT id, ${CITATION_FIELDS.join(', ')} FROM sources WHERE id = ?`).bind(id),
    ...[direct, via].flatMap(way => [
      db.prepare(`SELECT ${TILE_COLUMNS}, s.id AS s_id, ${SOURCE_SIGHTING} FROM ${way.from} WHERE ${live(way)} ORDER BY ${way.order} LIMIT ${SOURCE_PAGE}`).bind(id),
      // An index on the source does not order a sighting's rows, so the query orders by sighting and the pictures are put in position here.
      db.prepare(`SELECT x.sighting_id, x.position, ${IMAGE_FIELDS.map(field => `x.${field}`).join(', ')} FROM ${way.from} JOIN sighting_media x ON x.sighting_id = s.id WHERE ${live(way)} ORDER BY ${way.order} LIMIT ${SOURCE_PAGE * MEDIA_MAX}`).bind(id),
    ]),
  ])
  const source = found.results[0] as Source | undefined
  type Row = TileRow & { s_id: number; s_place: string; s_original_date: string | null; s_page: string | null; s_context: string | null; s_style: string | null; s_types: string | null; s_note: string | null; s_quotes: string | null }
  const listed = [false, true].flatMap((isVia, way) => withMedia((queries[way * 2].results as Row[]).map(({ s_id, s_place, s_original_date, s_page, s_context, s_style, s_types, s_note, s_quotes, ...tile }) => ({
    id: s_id, entry_id: tile.id, place: s_place, original_date: s_original_date, page: s_page, context: s_context, style: s_style, note: s_note, quotes: s_quotes, types: parseSightingTypes(s_types), tile: toTile(tile), via: isVia,
  })), (queries[way * 2 + 1].results as (MediaRow & { position: number })[]).sort((a, b) => a.sighting_id - b.sighting_id || a.position - b.position).map(({ position: _, ...image }) => image)) as Omit<SourceSighting, 'vias'>[]).slice(0, SOURCE_PAGE)
  // A citation is shown only while a visible sighting gives it.
  if (!source || !listed.length) return null
  return { source, sightings: withVias(listed, await viasOfSightings(db, listed.map(sighting => sighting.id))) as SourceSighting[] }
}

export const SOURCES_PAGE = 24
// The sightings read for each source and way it is cited, hidden or not, and the records a card draws.
export { SOURCE_CARD_READ } from './source-sightings'
export const SOURCE_CARD_RECORDS = 6

// Where a page of the gallery starts: after the source with this sort key and id. A cursor without a key
// is a place in a list read by id: the newest added, or the undated sources that end a sort by date. Null
// names a cursor of a shape the sort does not take.
export type SourceCursor = { key: number | null; id: number }
export const sourceCursorText = (cursor: SourceCursor) => cursor.key === null ? `${cursor.id}` : `${cursor.key}.${cursor.id}`
export function parseSourceCursor(sort: SourceSort, text: string): SourceCursor | null {
  const match = /^(?:(\d{1,9})\.)?([1-9]\d{0,15})$/.exec(text)
  if (!match || !Number.isSafeInteger(Number(match[2]))) return null
  const keyed = match[1] !== undefined
  if (sort === 'new' ? keyed : sort === 'most' ? !keyed : false) return null
  return { key: keyed ? Number(match[1]) : null, id: Number(match[2]) }
}

export type SourceCard = Source & { records: number; cover: string | null; tiles: Tile[] }

// Each order reads one partial index of the sources a visible record cites; a sort by date reads the dated
// ones by year and then the undated ones by id.
const SOURCE_READS = {
  new: { index: 'sources_listed', where: 'c.records > 0', key: null, descending: true },
  most: { index: 'sources_by_records', where: 'c.records > 0', key: 'records', descending: true },
  earliest: { index: 'sources_by_year', where: 'c.records > 0 AND c.year IS NOT NULL', key: 'year', descending: false },
  latest: { index: 'sources_by_year', where: 'c.records > 0 AND c.year IS NOT NULL', key: 'year', descending: true },
  undated: { index: 'sources_undated', where: 'c.records > 0 AND c.year IS NULL', key: null, descending: true },
} as const
type SourceRead = typeof SOURCE_READS[keyof typeof SOURCE_READS]

// Up to `limit` sources in one order after `cursor`. Each reads its first SOURCE_CARD_READ sightings of
// each way from its index and keeps the visible ones, so a source costs the same however long it is.
function sourceRun(db: D1Database, order: SourceRead, cursor: SourceCursor | null, limit: number, publisher: number | null, query: string) {
  const seen = (via: boolean) => `(SELECT json_group_array(json_array(r.entry_id, x.thumb_key)) ${sampledSightings(via)})`
  const direction = order.descending ? 'DESC' : 'ASC', past = order.descending ? '<' : '>'
  const start = order.descending ? Number.MAX_SAFE_INTEGER : 0
  const after = order.key ? `(c.${order.key}, c.id) ${past} (?, ?)` : `c.id ${past} ?`
  const bound = order.key ? [cursor?.key ?? start, cursor?.id ?? start] : [cursor?.id ?? start]
  type Row = Source & { year: number | null; records: number; direct: string; via: string }
  return db.prepare(`SELECT c.id, ${CITATION_FIELDS.map(field => `c.${field}`).join(', ')}, c.year, c.records, ${seen(false)} AS direct, ${seen(true)} AS via FROM ${query ? `(SELECT DISTINCT source_id FROM (${sourceMatches})) m CROSS JOIN sources c ON c.id = m.source_id` : `sources c INDEXED BY ${order.index}${publisher !== null ? '_publisher' : ''}`} WHERE ${order.where} ${publisher !== null ? 'AND c.publisher_id = ?' : ''} AND ${after} ORDER BY ${order.key ? `c.${order.key} ${direction}, ` : ''}c.id ${direction} LIMIT ?`)
    .bind(...(query ? [sourceNameKey(query), sourceNameKey(query)] : []), ...(publisher !== null ? [publisher] : []), ...bound, limit).all<Row>().then(({ results }) => results)
}

// A page of the source gallery in one order: its sources, each with the records seen in it, and the cursor
// of the next page.
export async function sourceList(db: D1Database, sort: SourceSort = 'new', cursor: SourceCursor | null = null, publisher: number | null = null, query = '') {
  const dated = sort === 'earliest' || sort === 'latest'
  const tail = dated && cursor !== null && cursor.key === null
  const order = SOURCE_READS[tail ? 'undated' : sort]
  let rows = await sourceRun(db, order, cursor, SOURCES_PAGE + 1, publisher, query)
  if (dated && !tail && rows.length <= SOURCES_PAGE) rows = [...rows, ...await sourceRun(db, SOURCE_READS.undated, null, SOURCES_PAGE + 1 - rows.length, publisher, query)]
  const page = rows.slice(0, SOURCES_PAGE), end = page.at(-1)
  // A page that ends on an undated source goes on among the undated ones, by id.
  const next = rows.length > SOURCES_PAGE && end ? sourceCursorText({ key: order.key === null ? null : order.key === 'year' && end.year === null ? null : end[order.key], id: end.id }) : null
  const cards = page.map(({ direct, via, year: _, ...source }) => {
    const rows = [direct, via].flatMap(list => JSON.parse(list) as [number, string | null][])
    return { ...source, cover: rows.find(([, thumb]) => thumb)?.[1] ?? null, ids: [...new Set(rows.map(([id]) => id))].slice(0, SOURCE_CARD_RECORDS) }
  })
  const drawn = [...new Set(cards.flatMap(card => card.ids))]
  const tiles = new Map<number, Tile>()
  if (drawn.length) {
    const { results } = await db.prepare(`SELECT ${TILE_COLUMNS} FROM json_each(?) j CROSS JOIN entries e ON e.id = j.value WHERE e.hidden_at IS NULL AND e.merged_into IS NULL`).bind(JSON.stringify(drawn)).all<TileRow>()
    for (const row of results) tiles.set(row.id, toTile(row))
  }
  return { sources: cards.map(({ ids, ...card }): SourceCard => ({ ...card, tiles: ids.flatMap(id => tiles.get(id) ?? []) })), next }
}

// The records that state this value: the ones described by a sequence, given a code, or related to a character.
export async function claimedBy(db: D1Database, kind: Claim['kind'], value: string, limit = 6) {
  const { results } = await db.prepare('SELECT e.id, e.ids, e.layout, e.cover_key FROM claims k CROSS JOIN entries e ON e.id = k.entry_id WHERE k.kind = ? AND k.value = ? AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY k.entry_id LIMIT ?').bind(kind, value, limit).all<{ id: number; ids: string | null; layout: string | null; cover_key: string | null }>()
  return results
}

// The records that carry this character's Unicode code, however the code was typed: in either case, with or
// without text after it. Each spelling is one range of the index, and the code is then read from what was stored.
export async function encodedAs(db: D1Database, char: string, limit = 6) {
  const code = codePoints(char)
  const read = (prefix: string) => db.prepare("SELECT e.id, e.ids, e.layout, e.cover_key, k.value FROM claims k CROSS JOIN entries e ON e.id = k.entry_id WHERE k.kind = 'encoding' AND k.value >= ? AND k.value < ? AND json_extract(k.data, '$.charset') = 'unicode' AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY k.entry_id LIMIT 50").bind(prefix, `${prefix}\uffff`)
  const found = await db.batch<{ id: number; ids: string | null; layout: string | null; cover_key: string | null; value: string }>([code, code.toLowerCase()].map(read))
  const records = new Map(found.flatMap(({ results }) => results).filter(row => encodedCharacter(row.value) === char).map(({ value: _, ...record }) => [record.id, record]))
  return [...records.values()].sort((a, b) => a.id - b.id).slice(0, limit)
}

// Records already described by exactly this sequence, offered while someone is adding one.
export const sameIds = (db: D1Database, ids: string, limit = 6) => claimedBy(db, 'ids', ids, limit)

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
const EXPORT_SIGHTING_COLUMNS = ['id', 'entry_id', 'first_entry', 'rev', 'source_id', ...OCCURRENCE_FIELDS, 'hidden_at', 'created_by', 'created_at', 'updated_at'] as const
const EXPORT_MEDIA = `(SELECT json_group_array(json_object(${IMAGE_FIELDS.map(field => `'${field}', x.${field}`).join(', ')})) FROM (SELECT * FROM sighting_media WHERE sighting_id = s.id ORDER BY position) x)`
const EXPORT_VIAS = `(SELECT json_group_array(json_object('id', x.id, 'quote', x.quote, ${CITATION_FIELDS.map(field => `'${field}', x.${field}`).join(', ')})) FROM (SELECT c.*, v.quote FROM sighting_vias v JOIN sources c ON c.id = v.source_id WHERE v.sighting_id = s.id ORDER BY v.position) x)`
const EXPORT_EVIDENCE = `CASE WHEN s.id IS NULL THEN NULL ELSE json_object(${EXPORT_SIGHTING_COLUMNS.map(column => `'${column}', s.${column}`).join(', ')}, ${CITATION_FIELDS.map(field => `'${field}', c.${field}`).join(', ')}, 'vias', json(${EXPORT_VIAS}), 'media', json(${EXPORT_MEDIA}), 'by_id', COALESCE(m.id, p.id), 'by_name', COALESCE(m.name, p.name)) END AS evidence_json`
// The name a record is credited to, after the anonymous people merged into an account take its name.
const EXPORT_AUTHOR = `(SELECT COALESCE(am.name, ap.name) FROM people ap LEFT JOIN people am ON am.id = ap.merged_into WHERE ap.id = e.created_by) AS created_by_name`
type ExportRow = Entry & { evidence_json: string | null; created_by_name: string | null }
export type ExportEntry = Entry & { claims: Claim[]; evidence: Sighting[]; created_by_name: string | null }
export async function exportPage(db: D1Database, after: number, limit: number, sightingAfter: number | null = null) {
  const rows: ExportRow[] = []
  if (sightingAfter !== null) {
    const continuation = await db.prepare(`SELECT e.*, ${EXPORT_AUTHOR}, ${EXPORT_EVIDENCE} FROM entries e JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${CITATION} ${WHO('s.created_by')} WHERE e.id = ? AND e.merged_into IS NULL AND e.hidden_at IS NULL AND s.id > ? ORDER BY s.id LIMIT ?`).bind(after, sightingAfter, limit + 1).all<ExportRow>()
    rows.push(...continuation.results)
  }
  if (rows.length <= limit) {
    const following = await db.prepare(`SELECT e.*, ${EXPORT_AUTHOR}, ${EXPORT_EVIDENCE} FROM entries e INDEXED BY entries_live_export LEFT JOIN sightings s INDEXED BY sightings_visible_export ON s.entry_id = e.id AND s.hidden_at IS NULL ${CITATION} ${WHO('s.created_by')} WHERE e.id > ? AND e.merged_into IS NULL AND e.hidden_at IS NULL ORDER BY e.id, s.id LIMIT ?`).bind(after, limit + 1 - rows.length).all<ExportRow>()
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

export const CUSTOM_SCRIPTS_MAX = 100
// Each name is one seek in `entries_custom_scripts` for the least name after the one before, so the list
// reads at most CUSTOM_SCRIPTS_MAX index entries however many records share a name.
const CUSTOM = `script = 'other' AND script_other IS NOT NULL AND merged_into IS NULL AND hidden_at IS NULL`
export const customScriptsStatement = (db: D1Database) => db.prepare(`WITH RECURSIVE names(name, n) AS (
  SELECT (SELECT MIN(script_other) FROM entries WHERE ${CUSTOM}), 1
  UNION ALL
  SELECT (SELECT MIN(script_other) FROM entries WHERE ${CUSTOM} AND script_other > names.name), n + 1 FROM names WHERE name IS NOT NULL AND n < ?
) SELECT name FROM names WHERE name IS NOT NULL`).bind(CUSTOM_SCRIPTS_MAX)

/** The names visible records give scripts outside the list. */
export async function customScripts(db: D1Database) {
  return (await customScriptsStatement(db).all<{ name: string }>()).results.map(row => row.name)
}
