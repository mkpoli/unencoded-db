import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { editSighting, getEntryRow, getSighting, readSightingFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { MEDIA_MAX } from '$lib/limits'
import { keptPictures, positiveId, readMarks, uploadedImages } from '../../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = positiveId(event.params.id), sightingId = positiveId(event.params.sighting)
  if (!id || !sightingId) error(404)
  const db = env(event).DB
  const entry = await getEntryRow(db, id)
  if (!entry || entry.hidden_at || entry.merged_into) error(404)
  const sighting = await getSighting(db, sightingId)
  if (!sighting || sighting.entry_id !== id || sighting.hidden_at) error(404)
  return { id, sighting }
}

export const load: PageServerLoad = async (event) => target(event)

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const { id, sighting } = await target(event)
    const form = await event.request.formData()
    const values = readSightingFields(form)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500)
    // The positions of the pictures the form takes away; new ones follow those that stay.
    const removed = new Set(form.getAll('remove_media').map(String))
    const removeMedia = [...removed]
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== sighting.rev) return fail(409, { error: 'conflict', values, summary, removeMedia })
    const { DB, MEDIA } = env(event)
    const marks = await readMarks(form, sighting.media)
    const gone = new Set(sighting.media.map((_, position) => position).filter(position => removed.has(String(position))))
    const keptCount = sighting.media.length - gone.size
    if (marks === 'invalid') return fail(400, { error: 'image', values, summary, removeMedia })
    const added = await uploadedImages(form, MEDIA)
    if (added === 'invalid' || keptCount + added.length > MEDIA_MAX) return fail(400, { error: 'image', values, summary, removeMedia })
    if (!keptCount && !added.length && !values.url && !values.via_url && !values.place) return fail(400, { error: 'evidence', values, summary, removeMedia })
    const kept = await keptPictures(MEDIA, sighting.media, marks, gone)
    const media = marks || added.length || kept.length !== sighting.media.length ? [...kept, ...added] : null
    const person = await writer(event, DB)
    const result = await editSighting(DB, sighting.id, rev, values, media, { actor: person.id, ip: await ipHash(event) }, summary || null, id)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code, values, summary, removeMedia })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
