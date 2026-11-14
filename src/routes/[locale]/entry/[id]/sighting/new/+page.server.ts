import { error, fail, redirect } from '@sveltejs/kit'
import { addSighting, getEntry, readSightingFields, SightingLimitError, SIGHTINGS_MAX } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId, uploadedImages } from '../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await getEntry(env(event).DB, id)
  if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
  return { id, ids: found.entry.ids }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const id = positiveId(event.params.id)
    if (!id) error(404)
    const { DB, MEDIA } = env(event)
    const found = await getEntry(DB, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    const values = readSightingFields(form)
    if (found.sightings.length >= SIGHTINGS_MAX) return fail(400, { error: 'sightingLimit', values })
    const media = await uploadedImages(form, MEDIA)
    if (media === 'invalid') return fail(400, { error: 'image', values })
    if (!media.length && !values.url && !values.via_url) return fail(400, { error: 'evidence', values })
    const person = await writer(event, DB)
    let sighting: number | null
    try {
      sighting = await addSighting(DB, id, values, media, { actor: person.id, ip: await ipHash(event) })
    } catch (cause) {
      if (cause instanceof SightingLimitError) return fail(400, { error: 'sightingLimit', values })
      throw cause
    }
    if (!sighting) return fail(404, { error: 'missing', values })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
