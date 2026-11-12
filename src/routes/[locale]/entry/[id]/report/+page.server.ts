import { error, fail, type RequestEvent } from '@sveltejs/kit'
import { getEntryRow, getSighting, report } from '$lib/server/entries'
import { env, guardWrite } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId } from '../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const db = env(event).DB
  const entry = await getEntryRow(db, id)
  if (!entry || entry.hidden_at || entry.merged_into) error(404)
  const sightings = event.url.searchParams.getAll('sighting')
  if (sightings.length > 1) error(404)
  if (!sightings.length) return { entry: id, sighting: null }
  const sighting = positiveId(sightings[0])
  if (!sighting) error(404)
  const found = await getSighting(db, sighting)
  if (!found || found.entry_id !== id || found.hidden_at) error(404)
  return { entry: id, sighting }
}

export const load: PageServerLoad = async (event) => ({ target: await target(event) })

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const selected = await target(event)
    const form = await event.request.formData()
    const input = form.get('reason')
    const reason = typeof input === 'string' ? input.trim() : ''
    if (!reason || reason.length > 2000) return fail(400, { error: 'reason', reason })
    const db = env(event).DB
    const person = await writer(event, db)
    await report(db, selected, reason, person.id)
    return { sent: true }
  },
}
