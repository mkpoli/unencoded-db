import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { editSighting, getEntryRow, getSighting, readSightingFields } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId, uploadedImage } from '../../../../../../_submission.server'
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
    const removeImage = form.get('remove_image') === '1'
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== sighting.rev) return fail(409, { error: 'conflict', values, summary, removeImage })
    if (!values.place) return fail(400, { error: 'place', values, summary, removeImage })
    const { DB, MEDIA } = env(event)
    const image = await uploadedImage(form, MEDIA)
    if (image === 'invalid') return fail(400, { error: 'image', values, summary, removeImage })
    const person = await writer(event, DB)
    const result = await editSighting(DB, sighting.id, rev, values, image ?? (removeImage ? 'remove' : null), { actor: person.id, ip: await ipHash(event) }, summary || null, id)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code, values, summary, removeImage })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
