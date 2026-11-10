import { CONTEXTS, STYLES, isScript, isStatus, isStoredSightingTypes } from '$lib/scripts'
import { ENTRY_FIELDS, SIGHTING_FIELDS, type EntryFields, type SightingFields } from './entries'

// Only entry fields are public; a snapshot can also hold sighting or internal data.
export function entrySnapshot(raw: string): EntryFields | null {
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isScript(value.script) || !isStatus(value.status)) return null
    // Older snapshots predate structured comparisons.
    if (!('related_characters' in value)) value.related_characters = null
    for (const field of ENTRY_FIELDS) {
      if (field === 'strokes') {
        if (value[field] !== null && (!Number.isInteger(value[field]) || value[field] < 0 || value[field] >= 200)) return null
      } else if (typeof value[field] !== 'string' && value[field] !== null) return null
    }
    return Object.fromEntries(ENTRY_FIELDS.map(field => [field, value[field]])) as EntryFields
  } catch { return null }
}

// Image references in old snapshots need not still exist. Only text can be restored.
export function sightingSnapshot(raw: string): SightingFields | null {
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.place !== 'string') return null
    // Older snapshots predate source types.
    if (!('types' in value)) value.types = null
    for (const field of SIGHTING_FIELDS) {
      if (typeof value[field] !== 'string' && value[field] !== null) return null
    }
    if (value.context !== null && !(CONTEXTS as readonly string[]).includes(value.context)) return null
    if (value.style !== null && !(STYLES as readonly string[]).includes(value.style)) return null
    if (!isStoredSightingTypes(value.types)) return null
    if (value.url !== null && !/^https?:\/\//i.test(value.url)) return null
    return Object.fromEntries(SIGHTING_FIELDS.map(field => [field, value[field]])) as SightingFields
  } catch { return null }
}

const ENTRY_KINDS = ['create', 'edit', 'revert']
const SIGHTING_KINDS = ['sighting', 'sighting_edit']

export type SnapshotRow = { sighting_id: number | null; kind: string; snapshot: string }

// The old version a revision holds, or null for a change that changed no readable text.
export function revisionFields(row: SnapshotRow) {
  return {
    fields: !row.sighting_id && ENTRY_KINDS.includes(row.kind) ? entrySnapshot(row.snapshot) : null,
    sightingFields: row.sighting_id && SIGHTING_KINDS.includes(row.kind) ? sightingSnapshot(row.snapshot) : null,
  }
}
