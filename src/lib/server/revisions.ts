import { readDates, sightingDates } from './date-readings'
import { CONTEXTS, STYLES, VIAS_MAX, isStoredSightingTypes } from '$lib/scripts'
import { CITATION_FIELDS, entryFieldsOf, SIGHTING_FIELDS, VIA_INPUTS, tidyVias, type EntryFields, type SightingFields, type Via } from './entries'

// Only entry fields are public; a snapshot can also hold sighting or internal data.
export const entrySnapshot = (raw: string): EntryFields | null => entryFieldsOf(raw)

// The chain of a snapshot: at most VIAS_MAX objects of the five citation fields and an optional quote, each
// link a web address or null. A snapshot written before quotes were kept reads as one that quotes nothing.
function parseVias(raw: unknown): Via[] | null {
  if (!Array.isArray(raw) || raw.length > VIAS_MAX) return null
  const vias: Via[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
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
    for (const field of SIGHTING_FIELDS) {
      if (typeof value[field] !== 'string' && value[field] !== null) return null
    }
    if (value.context !== null && !(CONTEXTS as readonly string[]).includes(value.context)) return null
    if (value.style !== null && !(STYLES as readonly string[]).includes(value.style)) return null
    if (!isStoredSightingTypes(value.types)) return null
    if (value.url !== null && !/^https?:\/\//i.test(value.url)) return null
    if (VIA_INPUTS.some(field => field in value)) return null
    const vias = parseVias(value.vias)
    if (!vias) return null
    return { ...Object.fromEntries(SIGHTING_FIELDS.map(field => [field, value[field]])), vias } as SightingFields
  } catch { return null }
}

const ENTRY_KINDS = ['create', 'edit', 'revert']
const SIGHTING_KINDS = ['sighting', 'sighting_edit']

export type SnapshotRow = { sighting_id: number | null; kind: string; snapshot: string; redacted_at?: string | null }

// The old version a revision holds, or null for a change that changed no readable text.
export function revisionFields(row: SnapshotRow) {
  return {
    fields: !row.redacted_at && !row.sighting_id && ENTRY_KINDS.includes(row.kind) ? entrySnapshot(row.snapshot) : null,
    sightingFields: !row.redacted_at && row.sighting_id && SIGHTING_KINDS.includes(row.kind) ? sightingSnapshot(row.snapshot) : null,
  }
}

export const revisionDates = (db: D1Database, rows: { sightingFields: SightingFields | null }[]) =>
  readDates(db, sightingDates(rows.flatMap(row => row.sightingFields ? [row.sightingFields] : [])))
