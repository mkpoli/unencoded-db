import { error, fail, redirect } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { archiveCited } from '$lib/server/archive'
import { addSighting, citesEvidence, CiteValidationError, getEntry, readSightingFields, SightingLimitError, SIGHTINGS_MAX, validateCiteTargets } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { loadSightingSeed, readViaPictures, recordIdParam, storeImages, uploadedImages } from '../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

// `?sighting=` starts the form from a visible sighting: its citation, where it was found and its pictures,
// so evidence from another record can be attached here.
export const load: PageServerLoad = async (event) => {
  const id = recordIdParam(event.params.code)
  if (!id) error(404)
  const { DB } = env(event)
  const found = await getEntry(DB, id)
  if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
  const loaded = await loadSightingSeed(DB, event.url.searchParams.get('sighting'))
  const seed = loaded && loaded.entry !== id ? loaded : null
  const siblings = found.sightings.filter(s => !s.hidden_at).map(({ id, title, place, report_date, original_date }) => ({ id, title, place, report_date, original_date }))
  return { id, ids: found.entry.ids, seed, siblings }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const id = recordIdParam(event.params.code)
    if (!id) error(404)
    const { DB, MEDIA } = env(event)
    const found = await getEntry(DB, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    // The pictures of the chain of the sighting the form started from may be kept, while it can be seen.
    const seed = await loadSightingSeed(DB, String(form.get('seed') ?? ''))
    const shots = await readViaPictures(form, seed?.values.vias)
    const values = readSightingFields(form, shots.kept)
    if (found.sightings.length >= SIGHTINGS_MAX) return fail(400, { error: 'sightingLimit', values })
    if (shots.error) return fail(400, { error: shots.error, values })
    const fields = readSightingFields(form, shots.all)
    const badCite = await validateCiteTargets(DB, fields.cites)
    if (badCite) return fail(400, { error: badCite, values })
    const media = await uploadedImages(form, MEDIA)
    if (media === 'invalid') return fail(400, { error: 'image', values })
    if (!media.length && !citesEvidence(fields)) return fail(400, { error: 'evidence', values })
    await storeImages(MEDIA, shots.files)
    const person = await writer(event, DB)
    let sighting: number | null
    try {
      sighting = await addSighting(DB, id, fields, media, { actor: person.id, ip: await ipHash(event) })
    } catch (cause) {
      if (cause instanceof SightingLimitError) return fail(400, { error: 'sightingLimit', values })
      if (cause instanceof CiteValidationError) return fail(400, { error: cause.code, values })
      throw cause
    }
    if (!sighting) return fail(404, { error: 'missing', values })
    notifyIndexNow(event, { entries: [id] })
    archiveCited(event, [fields])
    redirect(303, `/${event.params.locale}/${recordCode(id)}`)
  },
}
