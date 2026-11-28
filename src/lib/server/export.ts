import { quotations } from '$lib/quotations'
// The whole public dataset, for download. A page of `/api/entries` is a cursor into the same rows; this
// module walks every cursor, shapes the rows as JSON or CSV, and names the licence and the counts once.
import { CLAIM_KINDS, claimsOf, primaryLayoutOf, scopesOf, type Claim } from '$lib/claims'
import { recordCode } from '$lib/code'
import { parseContexts, parseSightingTypes } from '$lib/scripts'
import { exportIndexPage, exportPage, parseMarks, SIGHTING_FIELDS, type ExportEntry, type Sighting } from './entries'

export const DATASET_VERSION = 2
export const DATASET_NAME = 'Rare Character Compendium'
export const DATASET_LICENSE = 'CC BY-SA 4.0'
export const DATASET_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'
export const IMAGE_RIGHTS = 'Images keep the rights of their sources.'
export const DATASET_PUBLISHER = 'Glyph Atlas'

export type DatasetCounts = { records: number; evidence: number }

/** How much the download holds, read from the same index the download walks. */
export async function datasetCounts(db: D1Database): Promise<DatasetCounts> {
  const row = await db.prepare(`SELECT
    (SELECT count(*) FROM entries WHERE merged_into IS NULL AND hidden_at IS NULL) AS records,
    (SELECT count(*) FROM sightings s JOIN entries e ON e.id = s.entry_id WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL) AS evidence`).first<{ records: number; evidence: number }>()
  return { records: row?.records ?? 0, evidence: row?.evidence ?? 0 }
}

export function datasetMetadata(origin: string, counts: DatasetCounts, generatedAt: string, revision: number) {
  return {
    name: DATASET_NAME,
    version: DATASET_VERSION,
    publisher: DATASET_PUBLISHER,
    homepage: new URL('/', origin).href,
    license: DATASET_LICENSE,
    license_url: DATASET_LICENSE_URL,
    image_rights: IMAGE_RIGHTS,
    generated_at: generatedAt,
    revision,
    counts,
  }
}

/** The newest journal row. Every write to a record or a sighting adds one, so a download can tell whether
 * the rows it read still describe one state. */
export async function datasetRevision(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(MAX(id), 0) AS revision FROM revisions').first<{ revision: number }>()
  return row?.revision ?? 0
}

export async function assertDatasetUnchanged(db: D1Database, revision: number) {
  if (await datasetRevision(db) !== revision) throw new Error('The dataset changed during the download; retry.')
}

/** A record as the JSON export writes it: lists for the fields the table stores as JSON, and a public code. */
export function exportedEntry(entry: ExportEntry) {
  return {
    ...entry,
    code: recordCode(entry.id),
    types: parseSightingTypes(entry.types),
    marks: parseMarks(entry.marks),
    layout: primaryLayoutOf(entry.claims),
    evidence: entry.evidence.map(exportedSighting),
  }
}

/** Records per query. Larger than a page of the public API, which keeps the whole download within the
 * query budget of one Worker invocation for a long while. */
const EXPORT_BATCH_MAX = 500

/** Pages of visible records in the order of the export cursor. A record with more evidence than one
 * page holds continues into the next page, where its metadata and claims repeat. */
export async function* exportBatches(db: D1Database, size = EXPORT_BATCH_MAX): AsyncGenerator<ExportEntry[]> {
  let after = 0
  let sighting: number | null = null
  for (;;) {
    const page = await exportPage(db, after, Math.min(Math.max(size, 1), EXPORT_BATCH_MAX), sighting)
    if (page.entries.length) yield page.entries
    if (page.next === null) return
    if (page.next === after && page.next_sighting === sighting) throw new Error('export cursor did not advance')
    after = page.next
    sighting = page.next_sighting
  }
}

const exportedSighting = (sighting: Sighting) => ({ ...sighting, quotes: quotations(sighting.quotes), contexts: parseContexts(sighting.contexts), types: parseSightingTypes(sighting.types) })

/** The JSON file, one record at a time and one piece of evidence at a time. A record split across the
 * export pages keeps its first page's metadata and claims, and its evidence continues without a break. */
export async function* jsonChunks(db: D1Database, metadata: unknown, revision: number, size = EXPORT_BATCH_MAX): AsyncGenerator<string> {
  yield `{"dataset":${JSON.stringify(metadata)},"entries":[`
  let open: { id: number; first: boolean } | null = null
  let any = false
  for await (const batch of exportBatches(db, size)) {
    for (const entry of batch) {
      let current = open
      if (!current || current.id !== entry.id) {
        if (current) yield ']}'
        if (any) yield ','
        any = true
        const { evidence: _evidence, ...rest } = exportedEntry({ ...entry, evidence: [] })
        yield JSON.stringify(rest).slice(0, -1) + ',"evidence":['
        current = open = { id: entry.id, first: true }
      }
      for (const sighting of entry.evidence) {
        yield `${current.first ? '' : ','}${JSON.stringify(exportedSighting(sighting))}`
        current.first = false
      }
    }
  }
  if (open) yield ']}'
  yield '],"merged":['
  let anyMerged = false
  for await (const batch of mergedBatches(db, size)) {
    const parts: string[] = []
    for (const row of batch) {
      parts.push((anyMerged ? ',' : '') + JSON.stringify(row))
      anyMerged = true
    }
    yield parts.join('')
  }
  await assertDatasetUnchanged(db, revision)
  yield ']}\n'
}

/** Compact public index of every live record and its claims, streamed one batch at a time without
 *  evidence rows so external browsers can load the full catalogue quickly and without aborting on
 *  concurrent writes. */
export async function* indexChunks(db: D1Database, origin: string, generatedAt: string, size = EXPORT_BATCH_MAX): AsyncGenerator<string> {
  const metadata = {
    name: DATASET_NAME,
    version: DATASET_VERSION,
    publisher: DATASET_PUBLISHER,
    homepage: new URL('/', origin).href,
    license: DATASET_LICENSE,
    license_url: DATASET_LICENSE_URL,
    generated_at: generatedAt,
  }
  yield `{"dataset":${JSON.stringify(metadata)},"entries":[`
  let after = 0
  let any = false
  const step = Math.min(Math.max(size, 1), EXPORT_BATCH_MAX)
  for (;;) {
    const page = await exportIndexPage(db, after, step)
    if (page.entries.length) {
      const parts: string[] = []
      for (const entry of page.entries) {
        parts.push((any ? ',' : '') + JSON.stringify({
          id: entry.id,
          code: recordCode(entry.id),
          script: entry.script,
          script_other: entry.script_other,
          ids: entry.ids,
          layout: primaryLayoutOf(entry.claims),
          cover_key: entry.cover_key,
          status: entry.status,
          description: entry.description,
          radical: entry.radical,
          strokes: entry.strokes,
          first_year: entry.first_year,
          sightings: entry.sightings,
          claims: entry.claims.map(({ kind, value, data }) => ({ kind, value, ...(data ? { data } : {}) })),
        }))
        any = true
      }
      yield parts.join('')
    }
    if (page.next === null) break
    if (page.next <= after) throw new Error('index cursor did not advance')
    after = page.next
  }
  yield '],"merged":['
  let anyMerged = false
  for await (const batch of mergedBatches(db, step)) {
    const parts: string[] = []
    for (const row of batch) {
      parts.push((anyMerged ? ',' : '') + JSON.stringify(row))
      anyMerged = true
    }
    yield parts.join('')
  }
  yield ']}\n'
}

const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value)
  // Spreadsheet applications may interpret cells beginning with these characters as formulas. A whole
  // number is none: a year before the common era stays as it is.
  if (/^[\s]*[=+\-@]/u.test(text) && !/^-\d+$/.test(text)) text = "'" + text
  return `"${text.replace(/"/g, '""')}"`
}

// One column for each kind of claim, its values in order. A claim that holds under others names them
// after its value, and one that rests on evidence names the rows by their `sighting_id`:
// `東 (usage) [under: east | cmn:dōng] [evidence: #3 #7]`. The JSON form carries what else a claim holds.
const ENTRY_COLUMNS = ['script', 'script_other', 'description', 'status', 'radical', 'strokes'] as const
const BULK_ENTRY_COLUMNS = [...ENTRY_COLUMNS, 'created_by_name', 'created_by_agent', 'created_by_model'] as const
// A column added later goes last, so a reader that counts columns keeps reading the ones it knew.
export const CSV_SIGHTING_FIELDS = SIGHTING_FIELDS.filter(field => field !== 'closeness')
const csvColumns = (bulk: boolean) => ['entry_id', ...(bulk ? ['record_code'] as const : []), ...(bulk ? BULK_ENTRY_COLUMNS : ENTRY_COLUMNS), ...CLAIM_KINDS, 'sighting_id', ...CSV_SIGHTING_FIELDS, 'vias', 'images', 'cites', 'closeness']

const said = (claim: Claim) => claim.kind === 'encoding'
  ? `${claim.data?.charset}:${claim.value}`
  : claim.kind === 'relation'
    ? `${claim.value} (${claim.data?.relationship})`
    : claim.kind === 'reading' && claim.data?.doculect
      ? `${claim.data.doculect}:${claim.value}`
      : claim.value

export const csvHeader = (bulk = true) => csvColumns(bulk).map(csvCell).join(',') + '\r\n'

/** The rows of the CSV export, one for each piece of evidence and one for a record without any. The paged
 * route keeps the columns it had; the bulk file adds the record code and the name the record is credited to. */
export function csvRows(entries: readonly ExportEntry[], bulk = true) {
  const entryColumns = bulk ? BULK_ENTRY_COLUMNS : ENTRY_COLUMNS
  return entries.flatMap(({ evidence, claims, ...entry }) => {
    const sightings: (Sighting | null)[] = evidence.length ? evidence : [null]
    const stated = CLAIM_KINDS.map(kind => claimsOf(claims, kind).map(claim => [
      said(claim),
      ...(claim.under.length ? [`[under: ${scopesOf(claims, claim).map(said).join(' | ')}]`] : []),
      ...(claim.sightings.length ? [`[evidence: ${claim.sightings.map(id => `#${id}`).join(' ')}]`] : []),
    ].join(' ')).join('; '))
    return sightings.map(sighting => [
      entry.id,
      ...(bulk ? [recordCode(entry.id)] : []),
      ...entryColumns.map(field => entry[field]),
      ...stated,
      sighting?.id,
      ...CSV_SIGHTING_FIELDS.map(field => field === 'types' ? parseSightingTypes(sighting?.types).join(', ') : field === 'contexts' ? parseContexts(sighting?.contexts).join(', ') : sighting?.[field]),
      sighting ? JSON.stringify(sighting.vias) : '',
      sighting?.media.map(image => image.image_key).join('; '),
      sighting ? JSON.stringify(sighting.cites ?? []) : '',
      sighting?.closeness,
    ]).map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  }).join('')
}

export type MediaRow = {
  position: number
  image_key: string
  image_type: string
  image_w: number
  image_h: number
  thumb_key: string
  box: string | null
  via_position: number | null
  sighting_id: number
  entry_id: number
  source_id: number | null
  source_url: string | null
  source_title: string | null
  source_author: string | null
  source_publisher: string | null
  source_report_date: string | null
  source_container: string | null
  source_kind: string | null
}

const MEDIA_COLUMNS = ['record_code', 'entry_id', 'sighting_id', 'image_key', 'image_url', 'thumb_key', 'thumb_url', 'image_type', 'image_w', 'image_h', 'box', 'source_id', 'source_title', 'source_author', 'source_publisher', 'source_report_date', 'source_container', 'source_kind', 'source_url', 'via_position'] as const

const mediaUrl = (origin: string, key: string) => new URL(`/media/v2/${key}`, origin).href

export const mediaCsvHeader = () => MEDIA_COLUMNS.map(csvCell).join(',') + '\r\n'

/** The visible pictures, each with its record and the work it shows. The picture of a go-between shows the
 * go-between, and `via_position` is its place in the chain, from 0. */
export function mediaCsvRows(rows: readonly MediaRow[], origin: string) {
  return rows.map(row => [
    recordCode(row.entry_id),
    row.entry_id,
    row.sighting_id,
    row.image_key,
    mediaUrl(origin, row.image_key),
    row.thumb_key,
    mediaUrl(origin, row.thumb_key),
    row.image_type,
    row.image_w,
    row.image_h,
    row.box,
    row.source_id,
    row.source_title,
    row.source_author,
    row.source_publisher,
    row.source_report_date,
    row.source_container,
    row.source_kind,
    row.source_url,
    row.via_position,
  ].map(csvCell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '')
}

const MEDIA_QUERY = `SELECT m.position, m.image_key, m.image_type, m.image_w, m.image_h, m.thumb_key, m.box, NULL AS via_position,
  s.id AS sighting_id, s.entry_id,
  c.id AS source_id, c.url AS source_url, c.title AS source_title, c.author AS source_author, c.publisher AS source_publisher, c.report_date AS source_report_date, c.container AS source_container, c.source_kind
  FROM sighting_media m
  JOIN sightings s ON s.id = m.sighting_id
  JOIN entries e ON e.id = s.entry_id
  LEFT JOIN sources c ON c.id = s.source_id
  WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
    AND (m.sighting_id, m.position) > (?, ?)
  ORDER BY m.sighting_id, m.position LIMIT ?`

const VIA_MEDIA_QUERY = `SELECT m.position, m.image_key, m.image_type, m.image_w, m.image_h, m.thumb_key, NULL AS box, m.via_position,
  s.id AS sighting_id, s.entry_id,
  c.id AS source_id, c.url AS source_url, c.title AS source_title, c.author AS source_author, c.publisher AS source_publisher, c.report_date AS source_report_date, c.container AS source_container, c.source_kind
  FROM sighting_via_media m
  CROSS JOIN sighting_vias v ON v.sighting_id = m.sighting_id AND v.position = m.via_position
  JOIN sightings s ON s.id = m.sighting_id
  JOIN entries e ON e.id = s.entry_id
  JOIN sources c ON c.id = v.source_id
  WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
    AND (m.sighting_id, m.via_position, m.position) > (?, ?, ?)
  ORDER BY m.sighting_id, m.via_position, m.position LIMIT ?`

/** Every picture on a visible sighting, in the order of its sighting and then its place on the page, and after
 * them the pictures of the go-betweens. */
export async function* mediaBatches(db: D1Database, size = 500): AsyncGenerator<MediaRow[]> {
  const limit = Math.max(size, 1)
  for (const [query, first, cursorOf] of [
    [MEDIA_QUERY, [0, -1], (row: MediaRow) => [row.sighting_id, row.position]],
    [VIA_MEDIA_QUERY, [0, -1, -1], (row: MediaRow) => [row.sighting_id, row.via_position!, row.position]],
  ] as const) {
    let cursor: readonly number[] = first
    for (;;) {
      const { results } = await db.prepare(query).bind(...cursor, limit + 1).all<MediaRow>()
      const page = results.slice(0, limit)
      if (page.length) yield page
      if (results.length <= limit) break
      const last = cursorOf(page[page.length - 1])
      if (last.every((part, index) => part === cursor[index])) throw new Error('media cursor did not advance')
      cursor = last
    }
  }
}

export type MergedRow = {
  id: number
  code: string
  merged_into: number
  merged_into_code: string
}

const MERGED_COLUMNS = ['id', 'code', 'merged_into', 'merged_into_code'] as const
export const mergedCsvHeader = () => MERGED_COLUMNS.map(csvCell).join(',') + '\r\n'
export function mergedCsvRows(rows: readonly MergedRow[]) {
  return rows.map(row => [row.id, row.code, row.merged_into, row.merged_into_code].map(csvCell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '')
}

const MERGED_QUERY = `SELECT id, merged_into FROM entries INDEXED BY entries_merged_export
  WHERE merged_into IS NOT NULL AND hidden_at IS NULL AND id > ? ORDER BY id LIMIT ?`
// Follow each batch's distinct unresolved targets to their terminal live record in one recursive
// primary-key walk. `e.merged_into < w.id` guarantees termination, and hidden hops or targets yield no row.
const RESOLVE_TARGETS_QUERY = `WITH RECURSIVE walk(origin, id) AS (
  SELECT value, value FROM json_each(?)
  UNION ALL
  SELECT w.origin, e.merged_into FROM walk w JOIN entries e ON e.id = w.id
  WHERE e.merged_into IS NOT NULL AND e.hidden_at IS NULL AND e.merged_into < w.id
)
SELECT w.origin AS origin, w.id AS target
FROM walk w JOIN entries t ON t.id = w.id
WHERE t.merged_into IS NULL AND t.hidden_at IS NULL`
const TARGET_CHUNK = 90

/** Every retired record code whose merge chain ends at a visible canonical record, in ascending id order.
 *  Hidden records and merges into hidden records are omitted. */
export async function* mergedBatches(db: D1Database, size = EXPORT_BATCH_MAX): AsyncGenerator<MergedRow[]> {
  const limit = Math.min(Math.max(size, 1), EXPORT_BATCH_MAX)
  let after = 0
  for (;;) {
    const { results } = await db.prepare(MERGED_QUERY).bind(after, limit + 1).all<{ id: number; merged_into: number }>()
    const page = results.slice(0, limit)
    if (!page.length) return
    // Collapse any hops already inside this batch, then resolve remaining targets fresh from D1 so
    // concurrent unmerge/re-merge writes between batches never reuse a stale redirect.
    const direct = new Map(page.map(row => [row.id, row.merged_into]))
    const endpoint = (start: number) => {
      let current = start
      for (;;) {
        const next = direct.get(current)
        if (next === undefined || next >= current) return current
        current = next
      }
    }
    const endpoints = page.map(row => endpoint(row.merged_into))
    const uniqueTargets = [...new Set(endpoints)]
    const resolved = new Map<number, number>()
    for (let start = 0; start < uniqueTargets.length; start += TARGET_CHUNK) {
      const chunk = uniqueTargets.slice(start, start + TARGET_CHUNK)
      const { results: found } = await db.prepare(RESOLVE_TARGETS_QUERY).bind(JSON.stringify(chunk)).all<{ origin: number; target: number }>()
      for (const row of found) resolved.set(row.origin, row.target)
    }
    const out: MergedRow[] = []
    for (let i = 0; i < page.length; i++) {
      const target = resolved.get(endpoints[i])
      if (target !== undefined) out.push({ id: page[i].id, code: recordCode(page[i].id), merged_into: target, merged_into_code: recordCode(target) })
    }
    if (out.length) yield out
    if (results.length <= limit) return
    const last = page[page.length - 1].id
    if (last <= after) throw new Error('merged cursor did not advance')
    after = last
  }
}
