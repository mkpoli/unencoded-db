import { error, fail, redirect } from '@sveltejs/kit'
import { editEntry, citesEvidence, ENTRY_HISTORY_PAGE, getEntry, getEntryRow, history, mergedInto, putBackSighting, redactRevision, restoreSighting, unmergeEntry } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { thank, thankable, thankedOf } from '$lib/server/notifications'
import { tagList } from '$lib/server/tags'
import { writer } from '$lib/server/people'
import { entrySnapshot, revisionDates, revisionFields, sightingSnapshot } from '$lib/server/revisions'
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
  // Removed evidence keeps its history, with a way back; what a moderator hid shows nothing.
  const removed = found.sightings.filter(sighting => sighting.hidden_at && sighting.removed_by)
  const removedRevs = new Map(removed.map(sighting => [sighting.id, sighting.rev]))
  const before = event.url?.searchParams.get('before')
  if (before !== null && before !== undefined && !positiveId(before)) error(404)
  const viewer = event.locals?.person
  const [page, tags, duplicates] = await Promise.all([history(db, id, before ? positiveId(before) : null), tagList(db), mergedInto(db, id)])
  const next = page.length > ENTRY_HISTORY_PAGE ? page[ENTRY_HISTORY_PAGE - 1].id : null
  const rows = page.slice(0, ENTRY_HISTORY_PAGE)
    .filter(row => !row.sighting_id || visibleSightings.has(row.sighting_id) || removedRevs.has(row.sighting_id))
    .map(({ id, entry_id, sighting_id, kind, rev, summary, at, by_id, by_name, snapshot, redacted_at }) => ({
      id, entry_id, sighting_id, rev, summary, at, by_id, by_name, redacted: Boolean(redacted_at),
      ...revisionFields({ sighting_id, kind, snapshot, redacted_at }),
      sightingRev: sighting_id ? visibleSightings.get(sighting_id) ?? removedRevs.get(sighting_id) : null,
      removed: sighting_id !== null && removedRevs.has(sighting_id),
    }))
  const thanked = viewer ? await thankedOf(db, viewer.id, rows.map(row => row.id)) : []
  return { id, rev: found.entry.rev, updated_at: found.entry.updated_at, rows, duplicates, removed: removed.map(({ id, title, place }) => ({ id, name: title || place })), thanked, dates: await revisionDates(db, rows), next, tags: tags.map(({ name, label, type }) => ({ name, label, type })) }
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
      if (!sighting.media.length && !sighting.vias.some(via => via.pictures?.length) && !citesEvidence(fields) && !fields.place) return fail(400, { error: 'evidence' })
      const person = await writer(event, db)
      const result = await restoreSighting(db, id, sighting.id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, old.rev, revisionId)
      if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
      notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
      redirect(303, `/${event.params.locale}/entry/${id}/history`)
    }
    if (!baseRev || baseRev !== found.entry.rev) return fail(409, { error: 'conflict' })
    const old = await db.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND redacted_at IS NULL AND kind IN ('create','edit','revert','merge','unmerge')")
      .bind(revisionId, id).first<{ snapshot: string; rev: number }>()
    const fields = old && entrySnapshot(old.snapshot)
    if (!old || !fields) error(404)
    const person = await writer(event, db)
    const result = await editEntry(db, id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, `r${old.rev}`, 'revert', revisionId)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code })
    notifyIndexNow(event, { entries: [id] })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
  // A duplicate that joined this record parts from it again.
  unmerge: async event => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    const form = await event.request.formData()
    const from = positiveId(String(form.get('from') ?? ''))
    if (!id || !from) error(404)
    const db = env(event).DB
    if ((await getEntryRow(db, from))?.merged_into !== id) return fail(409, { error: 'conflict' })
    const person = await writer(event, db)
    if (!await unmergeEntry(db, from, { actor: person.id, ip: await ipHash(event) })) return fail(409, { error: 'conflict' })
    notifyIndexNow(event, { entries: [id, from] })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
  // Anyone puts removed evidence back.
  putBack: async event => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    const sightingId = positiveId(String((await event.request.formData()).get('sighting') ?? ''))
    if (!id || !sightingId) error(404)
    const db = env(event).DB
    const found = await getEntry(db, id)
    const sighting = found?.sightings.find(s => s.id === sightingId && s.hidden_at && s.removed_by)
    if (!found || found.entry.hidden_at || found.entry.merged_into || !sighting) error(404)
    const person = await writer(event, db)
    if (await putBackSighting(db, id, sightingId, { actor: person.id, ip: await ipHash(event) }) !== 'done') error(404)
    notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
    redirect(303, `/${event.params.locale}/entry/${id}#sighting-${sightingId}`)
  },
  // Anyone thanks whoever made a change; that person is told.
  thank: async event => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    if (!id) error(404)
    const db = env(event).DB
    const found = await getEntry(db, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const revisionId = positiveId(String((await event.request.formData()).get('revision') ?? ''))
    if (!revisionId || !await thankable(db, id, revisionId)) error(404)
    const person = await writer(event, db)
    if (!await thank(db, id, revisionId, { actor: person.id, ip: await ipHash(event) })) error(404)
    return { thanked: revisionId }
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
