import { error, fail, redirect } from '@sveltejs/kit'
import { editEntry, ENTRY_HISTORY_PAGE, getEntry, history, redactRevision, restoreSighting } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { entrySnapshot, revisionFields, sightingSnapshot } from '$lib/server/revisions'
import { positiveId } from '../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

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
  const next = page.length > ENTRY_HISTORY_PAGE ? page[ENTRY_HISTORY_PAGE - 1].id : null
  const rows = page.slice(0, ENTRY_HISTORY_PAGE)
    .filter(row => !row.sighting_id || visibleSightings.has(row.sighting_id))
    .map(({ id, entry_id, sighting_id, kind, rev, summary, at, by_id, by_name, snapshot, redacted_at }) => ({
      id, entry_id, sighting_id, kind, rev, summary, at, by_id, by_name, redacted: Boolean(redacted_at),
      ...revisionFields({ sighting_id, kind, snapshot, redacted_at }),
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
      const old = await db.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id = ? AND redacted_at IS NULL AND kind IN ('sighting','sighting_edit')")
        .bind(revisionId, id, sighting.id).first<{ snapshot: string; rev: number }>()
      const fields = old && sightingSnapshot(old.snapshot)
      if (!old || !fields) error(404)
      // A restore keeps the pictures, so a version without a place or a link needs one to stay.
      if (!sighting.media.length && !fields.url && !fields.via_url && !fields.place) return fail(400, { error: 'evidence' })
      const person = await writer(event, db)
      const result = await restoreSighting(db, id, sighting.id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, old.rev, revisionId)
      if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
      redirect(303, `/${event.params.locale}/entry/${id}/history`)
    }
    if (!baseRev || baseRev !== found.entry.rev) return fail(409, { error: 'conflict' })
    const old = await db.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND redacted_at IS NULL AND kind IN ('create','edit','revert')")
      .bind(revisionId, id).first<{ snapshot: string; rev: number }>()
    const fields = old && entrySnapshot(old.snapshot)
    if (!old || !fields) error(404)
    const person = await writer(event, db)
    const result = await editEntry(db, id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, `r${old.rev}`, 'revert', revisionId)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
  // A moderator takes a past version's content out of the history.
  redact: async event => {
    await guardWrite(event, 'EDITS', true)
    const id = positiveId(event.params.id)
    const person = event.locals.person
    if (!id || !person) error(404)
    const form = await event.request.formData()
    const revisionId = positiveId(String(form.get('revision') ?? ''))
    if (!revisionId) error(404)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500) || null
    if (!await redactRevision(env(event).DB, id, revisionId, { actor: person.id, ip: await ipHash(event) }, summary)) return fail(409, { error: 'redact' })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
}
