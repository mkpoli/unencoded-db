import { error, fail, redirect } from '@sveltejs/kit'
import { editEntry, ENTRY_FIELDS, getEntry, history, restoreSighting, SIGHTING_FIELDS, type EntryFields, type SightingFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { CONTEXTS, STYLES, isScript, isStatus, isStoredSightingTypes } from '$lib/scripts'
import { positiveId } from '../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

// Only entry fields are public; snapshots can also contain sighting or internal data.
function entrySnapshot(raw: string): EntryFields | null {
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
function sightingSnapshot(raw: string): SightingFields | null {
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

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const db = env(event).DB
  const found = await getEntry(db, id)
  if (!found || found.entry.hidden_at) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/entry/${found.entry.merged_into}`)
  const visibleSightings = new Map(found.sightings.filter(sighting => !sighting.hidden_at).map(sighting => [sighting.id, sighting.rev]))
  const before = event.url?.searchParams.get('before')
  if (before !== null && before !== undefined && !positiveId(before)) error(404)
  const page = await history(db, id, before ? positiveId(before) : null)
  const next = page.length > 500 ? page[499].id : null
  const rows = page.slice(0, 500)
    .filter(row => !row.sighting_id || visibleSightings.has(row.sighting_id))
    .map(({ id, sighting_id, kind, rev, summary, at, by_id, by_name, snapshot }) => ({
      id, sighting_id, kind, rev, summary, at, by_id, by_name,
      fields: !sighting_id && ['create', 'edit', 'revert'].includes(kind) ? entrySnapshot(snapshot) : null,
      sightingFields: sighting_id && ['sighting', 'sighting_edit'].includes(kind) ? sightingSnapshot(snapshot) : null,
      sightingRev: sighting_id ? visibleSightings.get(sighting_id) : null,
    }))
  return { id, rev: found.entry.rev, rows, next }
}

export const actions: Actions = {
  restore: async event => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    if (!id) error(404)
    const db = env(event).DB
    const found = await getEntry(db, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    const baseRev = positiveId(String(form.get('rev') ?? ''))
    const revisionId = positiveId(String(form.get('revision') ?? ''))
    if (!revisionId) error(404)
    if (form.has('sighting')) {
      const sightingId = positiveId(String(form.get('sighting') ?? ''))
      const sighting = found.sightings.find(s => s.id === sightingId && !s.hidden_at)
      if (!sighting) error(404)
      if (!baseRev || baseRev !== sighting.rev) return fail(409, { error: 'conflict' })
      const old = await db.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id = ? AND kind IN ('sighting','sighting_edit')")
        .bind(revisionId, id, sighting.id).first<{ snapshot: string; rev: number }>()
      const fields = old && sightingSnapshot(old.snapshot)
      if (!old || !fields) error(404)
      const person = await writer(event, db)
      const result = await restoreSighting(db, id, sighting.id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, old.rev)
      if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
      redirect(303, `/${event.params.locale}/entry/${id}/history`)
    }
    if (!baseRev || baseRev !== found.entry.rev) return fail(409, { error: 'conflict' })
    const old = await db.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND kind IN ('create','edit','revert')")
      .bind(revisionId, id).first<{ snapshot: string; rev: number }>()
    const fields = old && entrySnapshot(old.snapshot)
    if (!old || !fields) error(404)
    const person = await writer(event, db)
    const result = await editEntry(db, id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, `r${old.rev}`, 'revert')
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
}
