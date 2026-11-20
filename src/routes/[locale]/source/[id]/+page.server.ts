import { copyOfSource } from '$lib/server/digitized-copies'
import { readDates } from '$lib/server/date-readings'
import { error, fail, type RequestEvent } from '@sveltejs/kit'
import { sourcePage } from '$lib/server/entries'
import { env, guardWrite } from '$lib/server/guard'
import { notifyIndexNow } from '$lib/server/indexnow'
import { tileGlyphs } from '$lib/server/glyphs'
import { positiveId } from '../../../_submission.server'
import { writer } from '$lib/server/people'
import { editSourceAlias, sourceAliasChanges, sourceAliases } from '$lib/server/source-aliases'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await sourcePage(env(event).DB, id)
  if (!found) error(404)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, found.sightings.map(sighting => sighting.tile), event.locals.glyphStyle)
  const dates = await readDates(env(event).DB, [found.source.report_date, ...found.sightings.flatMap(s => [s.original_date, ...s.vias.map(via => via.report_date)])])
  const param = event.url.searchParams.get('before')
  const before = param === null ? null : positiveId(param)
  if (param !== null && !before) error(404)
  const [aliases, history, copy] = await Promise.all([sourceAliases(env(event).DB, id), sourceAliasChanges(env(event).DB, id, before), copyOfSource(env(event).DB, id)])
  return { ...found, glyphs, dates, aliases, copy, ...history, before }
}

async function aliasAction(event: RequestEvent, remove: boolean) {
  await guardWrite(event, 'EDITS')
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const value = (await event.request.formData()).get('alias')
  const db = env(event).DB
  if (typeof value !== 'string' || !value.trim() || value.length > 300 || !await editSourceAlias(db, id, value, remove, (await writer(event, db)).id))
    return fail(400, { aliasError: true, value: remove || typeof value !== 'string' ? '' : value.slice(0, 300) })
  notifyIndexNow(event, { sources: [id] })
  return { aliasError: false, value: '' }
}

export const actions: Actions = {
  addAlias: event => aliasAction(event, false),
  removeAlias: event => aliasAction(event, true),
}
