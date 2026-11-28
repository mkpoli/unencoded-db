import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { recordCode } from '$lib/code'
import { getEntry, readEntryFields, splitSighting, standsAlone } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { scheduleAtlasSync } from '$lib/server/atlas-evidence'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { taxonomy } from '$lib/server/tags'
import { positiveId, recordIdParam } from '../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = recordIdParam(event.params.code), sightingId = positiveId(event.params.sighting)
  if (!id || !sightingId) error(404)
  const found = await getEntry(env(event).DB, id)
  if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
  const sighting = found.sightings.find(item => item.id === sightingId && !item.hidden_at)
  if (!sighting) error(404)
  return { id, entry: found.entry, sighting, only: standsAlone(found.sightings, sightingId) }
}

export const load: PageServerLoad = async (event) => {
  const { id, sighting, only } = await target(event)
  const { place, title, author, page, report_date, original_date, media, rev } = sighting
  return { id, only, sighting: { id: sighting.id, place, title, author, page, report_date, original_date, rev, picture: media[0] ?? null } }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const { id, sighting } = await target(event)
    const form = await event.request.formData()
    const { DB } = env(event)
    const { fields, error: claimError } = readEntryFields(form, (await taxonomy(DB)).tags)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500)
    const reject = (status: 400 | 404 | 409, code: string) => fail(status, { error: code, described: null as number | null, values: fields, summary })
    if (claimError) return reject(400, claimError)
    // A record number is never given back, so a form left undescribed is made on purpose.
    if (!fields.claims.some(claim => claim.kind === 'ids' && isDescription(claim.value)) && !form.has('undescribed')) return reject(400, 'undescribed')
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev) return reject(409, 'conflict')
    const person = await writer(event, DB)
    const result = await splitSighting(DB, id, sighting.id, rev, fields, { actor: person.id, ip: await ipHash(event) }, summary || null)
    if (typeof result === 'string') return reject(result === 'missing' || result === 'merged' ? 404 : 409, result)
    if ('described' in result) return fail(409, { error: result.described === id ? 'same' : 'described', described: result.described, values: fields, summary })
    notifyIndexNow(event, { entries: [id, result.id], sources: citedBy(sighting) })
    scheduleAtlasSync(event, [result.id])
    redirect(303, `/${event.params.locale}/${recordCode(result.id)}#sighting-${sighting.id}`)
  },
}
