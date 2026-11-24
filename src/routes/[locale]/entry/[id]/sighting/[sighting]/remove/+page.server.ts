import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { getEntryRow, getSighting, removeSighting } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { positiveId } from '../../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = positiveId(event.params.id), sightingId = positiveId(event.params.sighting)
  if (!id || !sightingId) error(404)
  const db = env(event).DB
  const entry = await getEntryRow(db, id)
  if (!entry || entry.hidden_at || entry.merged_into) error(404)
  const sighting = await getSighting(db, sightingId)
  if (!sighting || sighting.entry_id !== id || sighting.hidden_at) error(404)
  return { id, sighting, only: entry.sightings === 1 }
}

export const load: PageServerLoad = async (event) => {
  const { id, sighting, only } = await target(event)
  const { place, title, author, page, report_date, original_date, media, rev } = sighting
  return { id, only, sighting: { id: sighting.id, place, title, author, page, report_date, original_date, rev, picture: media[0] ?? null } }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const { id, sighting } = await target(event)
    const form = await event.request.formData()
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500)
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev) return fail(409, { error: 'conflict', summary })
    const { DB } = env(event)
    const person = await writer(event, DB)
    const result = await removeSighting(DB, id, sighting.id, rev, { actor: person.id, ip: await ipHash(event) }, summary || null)
    if (result !== 'done') return fail(result === 'missing' || result === 'merged' ? 404 : 409, { error: result, summary })
    notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
    redirect(303, `/${event.params.locale}/entry/${id}/history`)
  },
}
