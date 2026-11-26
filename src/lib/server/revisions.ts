import { quotations } from '../quotations'
import { readDates, sightingDates } from './date-readings'
import { STYLES, VIAS_MAX, isStoredContexts, isStoredSightingTypes, sourceKind } from '$lib/scripts'
import { CITATION_FIELDS, entryFieldsOf, SIGHTING_FIELDS, VIA_INPUTS, tidyVias, type EntryFields, type SightingFields, type Via } from './entries'

// Only entry fields are public; a snapshot can also hold sighting or internal data.
export const entrySnapshot = (raw: string): EntryFields | null => entryFieldsOf(raw)

// The chain of a snapshot: at most VIAS_MAX objects of the citation fields and an optional quote, each
// link a web address or null. A snapshot written before quotes, containers or kinds were kept reads as one without them.
function parseVias(raw: unknown): Via[] | null {
  if (!Array.isArray(raw) || raw.length > VIAS_MAX) return null
  const vias: Via[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    if (item.container === undefined) item.container = null
    if (item.source_kind === undefined) item.source_kind = null
    if (item.source_kind !== sourceKind(item.source_kind)) return null
    for (const field of CITATION_FIELDS) if (typeof item[field] !== 'string' && item[field] !== null) return null
    if (typeof item.quote !== 'string' && item.quote !== null && item.quote !== undefined) return null
    if (item.url !== null && !/^https?:\/\//i.test(item.url)) return null
    vias.push({ ...Object.fromEntries(CITATION_FIELDS.map(field => [field, item[field]])), quote: typeof item.quote === 'string' ? item.quote : null } as Via)
  }
  return tidyVias(vias)
}

// The text of a past version. A restore brings back the text and leaves the sighting's pictures as they are.
export function sightingSnapshot(raw: string): SightingFields | null {
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.place !== 'string') return null
    if (!('quotes' in value)) value.quotes = null
    if (!('container' in value)) value.container = null
    if (!('source_kind' in value)) value.source_kind = null
    for (const field of SIGHTING_FIELDS) {
      if (typeof value[field] !== 'string' && value[field] !== null) return null
    }
    if (value.source_kind !== sourceKind(value.source_kind)) return null
    quotations(value.quotes)
    if (!isStoredContexts(value.contexts)) return null
    if (value.style !== null && !(STYLES as readonly string[]).includes(value.style)) return null
    if (!isStoredSightingTypes(value.types)) return null
    if (value.url !== null && !/^https?:\/\//i.test(value.url)) return null
    if (VIA_INPUTS.some(field => field in value)) return null
    const vias = parseVias(value.vias)
    if (!vias) return null
    return { ...Object.fromEntries(SIGHTING_FIELDS.map(field => [field, value[field]])), vias } as SightingFields
  } catch { return null }
}

// A merge and its undoing leave the record that stayed with new fields, and name the other record.
const ENTRY_KINDS = ['create', 'edit', 'revert', 'merge', 'unmerge']
const MERGE_KINDS = ['merge', 'unmerge']
const SIGHTING_KINDS = ['sighting', 'sighting_edit']

export type SnapshotRow = { sighting_id: number | null; kind: string; snapshot: string; redacted_at?: string | null }

// Whether a hide or an unhide is a reader's: evidence taken off its record or put back on it.
const removal = ({ kind, snapshot }: SnapshotRow) => (kind === 'hide' || kind === 'unhide') && snapshot === '{"removed":true}'

// The old version a revision holds, or null for a change that changed no readable text.
export function revisionFields(row: SnapshotRow) {
  const moved = row.kind === 'edit' || row.kind === 'create' ? moveSnapshot(row.snapshot) : null
  return {
    kind: removal(row) ? row.kind === 'hide' ? 'remove' : 'put_back' : moved && row.kind === 'edit' ? 'move' : row.kind,
    moved,
    fields: !row.redacted_at && !row.sighting_id && ENTRY_KINDS.includes(row.kind) ? entrySnapshot(row.snapshot) : null,
    sightingFields: !row.redacted_at && row.sighting_id && SIGHTING_KINDS.includes(row.kind) ? sightingSnapshot(row.snapshot) : null,
    merge: MERGE_KINDS.includes(row.kind) ? mergeSnapshot(row.snapshot) : null,
  }
}

// Which evidence an edit moved, or a record was made for, and the record it went to or came from.
function moveSnapshot(raw: string): { sighting: number; to?: number; from?: number } | null {
  try {
    const { sighting, to, from } = JSON.parse(raw)?.moved ?? {}
    const id = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0
    return !id(sighting) ? null : id(to) ? { sighting, to } : id(from) ? { sighting, from } : null
  } catch { return null }
}

// The other record of a merge: the duplicate a record took in (`from`), or the record a duplicate joined (`into`).
function mergeSnapshot(raw: string): { from: number } | { into: number } | null {
  try {
    const value = JSON.parse(raw)
    if (Number.isSafeInteger(value?.from) && value.from > 0) return { from: value.from }
    if (Number.isSafeInteger(value?.into) && value.into > 0) return { into: value.into }
    return null
  } catch { return null }
}

export const revisionDates = (db: D1Database, rows: { sightingFields: SightingFields | null }[]) =>
  readDates(db, sightingDates(rows.flatMap(row => row.sightingFields ? [row.sightingFields] : [])))
