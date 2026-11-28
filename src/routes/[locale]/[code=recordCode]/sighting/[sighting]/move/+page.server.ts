import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { getEntry, getEntryRow, moveSighting, standsAlone, tilesOf } from '$lib/server/entries'
import { tileGlyphs } from '$lib/server/glyphs'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { positiveId, recordIdParam, recordNamed } from '../../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function target(event: RequestEvent) {
  const id = recordIdParam(event.params.code), sightingId = positiveId(event.params.sighting)
  if (!id || !sightingId) error(404)
  const db = env(event).DB
  const found = await getEntry(db, id)
  if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
  const sighting = found.sightings.find(item => item.id === sightingId && !item.hidden_at)
  if (!sighting) error(404)
  return { id, sighting, only: standsAlone(found.sightings, sightingId) }
}

// The record a reader names, or the one it was merged into.
async function destination(db: D1Database, text: string) {
  let id = recordNamed(text)
  for (let step = 0; id && step < 8; step++) {
    const entry = await getEntryRow(db, id)
    if (!entry || entry.hidden_at) return null
    if (!entry.merged_into) return id
    id = entry.merged_into
  }
  return null
}

export const load: PageServerLoad = async (event) => {
  const { id, sighting, only } = await target(event)
  const db = env(event).DB
  const typed = event.url.searchParams.get('to') ?? ''
  const to = typed ? await destination(db, typed) : null
  const tiles = await tilesOf(db, to ? [id, to] : [id])
  const pair = to && to !== id ? [tiles.get(id)!, tiles.get(to)!] : null
  const { place, title, author, page, report_date, original_date, media, rev } = sighting
  return {
    id, only, typed, to: pair ? to : null, problem: typed && !pair ? (to === id ? 'same' : 'missing') : null, pair,
    sighting: { id: sighting.id, place, title, author, page, report_date, original_date, rev, picture: media[0] ?? null },
    glyphs: pair ? await tileGlyphs(event.platform, event.url.origin, pair, event.locals.glyphStyle) : {},
  }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const { id, sighting } = await target(event)
    const form = await event.request.formData()
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500)
    const rev = positiveId(String(form.get('rev') ?? ''))
    const { DB } = env(event)
    const to = await destination(DB, String(form.get('to') ?? ''))
    if (!to) return fail(400, { error: 'missing', summary })
    if (!rev) return fail(409, { error: 'conflict', summary })
    const person = await writer(event, DB)
    const result = await moveSighting(DB, id, sighting.id, rev, to, { actor: person.id, ip: await ipHash(event) }, summary || null)
    if (result !== 'done') return fail(result === 'missing' || result === 'merged' ? 404 : 409, { error: result, summary })
    notifyIndexNow(event, { entries: [id, to], sources: citedBy(sighting) })
    redirect(303, `/${event.params.locale}/${recordCode(to)}#sighting-${sighting.id}`)
  },
}
