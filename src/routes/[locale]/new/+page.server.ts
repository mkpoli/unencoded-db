import { fail, redirect } from '@sveltejs/kit'
import { createEntry, readEntryFields, readSightingFields, validRelatedFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { uploadedImage } from '../../_submission.server'
import type { Actions } from './$types'

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const form = await event.request.formData()
    const entry = readEntryFields(form), sighting = readSightingFields(form)
    const values = { ...entry, ...sighting }
    if (!validRelatedFields(form)) return fail(400, { error: 'relatedCharacters', values })
    if (!sighting.place) return fail(400, { error: 'place', values })
    const { DB, MEDIA } = env(event)
    const image = await uploadedImage(form, MEDIA)
    if (image === 'invalid') return fail(400, { error: 'image', values })
    if (!image && !sighting.url) return fail(400, { error: 'evidence', values })
    const person = await writer(event, DB)
    const id = await createEntry(DB, entry, sighting, image, { actor: person.id, ip: await ipHash(event) })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
