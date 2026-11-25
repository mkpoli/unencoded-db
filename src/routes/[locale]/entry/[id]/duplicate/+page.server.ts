import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { valuesOf } from '$lib/claims'
import { claimedBy, getEntry, mergeEntry, tilesOf } from '$lib/server/entries'
import { tileGlyphs } from '$lib/server/glyphs'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { positiveId, recordNamed } from '../../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

async function record(event: RequestEvent) {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await getEntry(env(event).DB, id)
  if (!found || found.entry.hidden_at) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/entry/${found.entry.merged_into}`)
  return { id, found }
}

export const load: PageServerLoad = async (event) => {
  const { id, found } = await record(event)
  const db = env(event).DB
  const typed = event.url.searchParams.get('of') ?? ''
  const of = typed ? recordNamed(typed) : null
  // The records described by a sequence this record is described by are the likeliest to repeat it.
  const alike = of ? [] : (await Promise.all(valuesOf(found.claims, 'ids').map(ids => claimedBy(db, 'ids', ids)))).flat().map(row => row.id).filter(other => other !== id)
  const tiles = await tilesOf(db, [...new Set([id, ...(of ? [of] : alike)])])
  const pair = of && of !== id && tiles.has(of) ? [Math.min(id, of), Math.max(id, of)].map(key => tiles.get(key)!) : null
  const shown = pair ?? [...new Set(alike)].flatMap(other => tiles.get(other) ?? [])
  return { id, typed, unknown: Boolean(typed) && !pair, pair, alike: pair ? [] : shown, glyphs: await tileGlyphs(event.platform, event.url.origin, shown, event.locals.glyphStyle) }
}

export const actions: Actions = {
  // The later record joins the earlier one, whichever of the two the form was opened from.
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const { id } = await record(event)
    const form = await event.request.formData()
    const of = recordNamed(String(form.get('of') ?? ''))
    if (!of) return fail(400, { error: 'missing' })
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500) || null
    const db = env(event).DB
    const person = await writer(event, db)
    const from = Math.max(id, of), into = Math.min(id, of)
    const result = await mergeEntry(db, from, into, { actor: person.id, ip: await ipHash(event) }, summary)
    if (!result.ok) return fail(result.code === 'missing' ? 404 : 400, { error: result.code })
    notifyIndexNow(event, { entries: [from, into] })
    redirect(303, `/${event.params.locale}/entry/${into}`)
  },
}
