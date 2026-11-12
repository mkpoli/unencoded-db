import { fail, redirect } from '@sveltejs/kit'
import { CITATION_FIELDS, VIA_FIELDS, type SightingFields, createEntry, getEntryRow, getSighting, readEntryFields, readSightingFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId, uploadedImages } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

// `?sighting=` starts the form from a visible sighting: its citation, where it was found and its pictures,
// for another character seen in the same place.
export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.url.searchParams.get('sighting'))
  if (!id) return { seed: null }
  const { DB } = env(event)
  const sighting = await getSighting(DB, id)
  const entry = sighting && !sighting.hidden_at ? await getEntryRow(DB, sighting.entry_id) : null
  if (!sighting || !entry || entry.hidden_at || entry.merged_into) return { seed: null }
  const values: Partial<SightingFields> = Object.fromEntries(([...CITATION_FIELDS, ...VIA_FIELDS, 'place', 'original_date', 'page'] as const).map(field => [field, sighting[field]]))
  return { seed: { values, pictures: sighting.media.map(picture => picture.image_key) } }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const form = await event.request.formData()
    const { fields: entry, error: claimError } = readEntryFields(form), sighting = readSightingFields(form)
    const values = { ...entry, ...sighting }
    if (claimError) return fail(400, { error: claimError, values })
    if (!sighting.place) return fail(400, { error: 'place', values })
    const { DB, MEDIA } = env(event)
    const media = await uploadedImages(form, MEDIA)
    if (media === 'invalid') return fail(400, { error: 'image', values })
    if (!media.length && !sighting.url && !sighting.via_url) return fail(400, { error: 'evidence', values })
    const person = await writer(event, DB)
    const id = await createEntry(DB, entry, sighting, media, { actor: person.id, ip: await ipHash(event) })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
