import { fail, redirect } from '@sveltejs/kit'
import { createEntry, readEntryFields, readSightingFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { uploadedImages } from '../../_submission.server'
import type { Actions } from './$types'

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
    if (!media.length && !sighting.url) return fail(400, { error: 'evidence', values })
    const person = await writer(event, DB)
    const id = await createEntry(DB, entry, sighting, media, { actor: person.id, ip: await ipHash(event) })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
