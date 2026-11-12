import { CONTEXTS, STYLES, isStoredSightingTypes } from '$lib/scripts'
import { entryFieldsOf, SIGHTING_FIELDS, type EntryFields, type SightingFields } from './entries'

// Only entry fields are public; a snapshot can also hold sighting or internal data.
export const entrySnapshot = (raw: string): EntryFields | null => entryFieldsOf(raw)

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
    for (const field of ['url', 'via_url'] as const) if (value[field] !== null && !/^https?:\/\//i.test(value[field])) return null
    return Object.fromEntries(SIGHTING_FIELDS.map(field => [field, value[field]])) as SightingFields
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
