import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { archiveCited } from '$lib/server/archive'
import { citesEvidence, editSighting, getEntry, getSighting, readSightingFields, validateCiteTargets } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { MEDIA_MAX } from '$lib/limits'
import { keptPictures, positiveId, readMarks, readViaPictures, storeImages, uploadedImages } from '../../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = positiveId(event.params.id), sightingId = positiveId(event.params.sighting)
  if (!id || !sightingId) error(404)
  const db = env(event).DB
  const found = await getEntry(db, id)
  if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
  const sighting = found.sightings.find(item => item.id === sightingId && !item.hidden_at) ?? await getSighting(db, sightingId)
  if (!sighting || sighting.entry_id !== id || sighting.hidden_at) error(404)
  const siblings = found.sightings.filter(item => !item.hidden_at && item.id !== sightingId).map(({ id, title, place, report_date, original_date }) => ({ id, title, place, report_date, original_date }))
  return { id, sighting, siblings }
}

export const load: PageServerLoad = async (event) => target(event)

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const { id, sighting } = await target(event)
    const form = await event.request.formData()
    const shots = await readViaPictures(form, sighting.vias)
    const values = readSightingFields(form, shots.kept)
    if (!form.has('quote_text')) values.quotes = sighting.quotes
    if (!form.has('cites_present') && !form.has('cite_kind')) values.cites = sighting.cites
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500)
    // The positions of the pictures the form takes away; new ones follow those that stay.
    const removed = new Set(form.getAll('remove_media').map(String))
    const removeMedia = [...removed]
    // The marks drawn on the stored pictures come back with a refused form, to be drawn again.
    const marks = form.getAll('media_box').map(String)
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== sighting.rev) return fail(409, { error: 'conflict', values, summary, removeMedia, marks: null })
    const { DB, MEDIA } = env(event)
    if (shots.error) return fail(400, { error: shots.error, values, summary, removeMedia, marks })
    const heldTargets = new Set(sighting.cites.map(cite => cite.sighting).filter((target): target is number => target !== null))
    const badCite = await validateCiteTargets(DB, values.cites, sighting.id, heldTargets)
    if (badCite) return fail(400, { error: badCite, values, summary, removeMedia, marks })
    const fields = { ...values, vias: readSightingFields(form, shots.all).vias }
    const read = await readMarks(form, sighting.media)
    const gone = new Set(sighting.media.map((_, position) => position).filter(position => removed.has(String(position))))
    const keptCount = sighting.media.length - gone.size
    if (read === 'invalid') return fail(400, { error: 'image', values, summary, removeMedia, marks })
    const added = await uploadedImages(form, MEDIA)
    if (added === 'invalid' || keptCount + added.length > MEDIA_MAX) return fail(400, { error: 'image', values, summary, removeMedia, marks })
    if (!keptCount && !added.length && !citesEvidence(fields) && !values.place) return fail(400, { error: 'evidence', values, summary, removeMedia, marks })
    const kept = await keptPictures(MEDIA, sighting.media, read, gone)
    const media = read || added.length || kept.length !== sighting.media.length ? [...kept, ...added] : null
    await storeImages(MEDIA, shots.files)
    const person = await writer(event, DB)
    const result = await editSighting(DB, sighting.id, rev, fields, media, { actor: person.id, ip: await ipHash(event) }, summary || null, id)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : result.code === 'missing' || result.code === 'merged' ? 404 : 400, { error: result.code, values, summary, removeMedia, marks: null })
    notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
    archiveCited(event, [fields])
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
