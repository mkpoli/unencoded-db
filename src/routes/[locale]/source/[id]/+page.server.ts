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
import { archiveNow, offersArchiveNow } from '$lib/server/archive'
import { editSourceArchive, sourceArchiveChanges, sourceArchives } from '$lib/server/source-archives'
import { ARCHIVE_URL_MAX, archiveUrl } from '$lib/source-archives'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await sourcePage(env(event).DB, id)
  if (!found) error(404)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, [...found.sightings.map(sighting => sighting.tile), ...found.namedIn.map(item => item.tile)], event.locals.glyphStyle)
  const dates = await readDates(env(event).DB, [found.source.report_date, ...found.sightings.flatMap(s => [s.original_date, ...s.vias.map(via => via.report_date)]), ...found.namedIn.flatMap(item => [item.original_date, item.report_date])])
  const cursor = (name: string) => {
    const param = event.url.searchParams.get(name)
    const value = param === null ? null : positiveId(param)
    if (param !== null && !value) error(404)
    return value
  }
  const before = cursor('before'), archivesBefore = cursor('archivesBefore')
  const db = env(event).DB
  const [aliases, history, archives, archiveHistory, copy] = await Promise.all([sourceAliases(db, id), sourceAliasChanges(db, id, before),
    sourceArchives(db, id), sourceArchiveChanges(db, id, archivesBefore), copyOfSource(db, id)])
  return { ...found, glyphs, dates, aliases, copy, ...history, before, archives, archiveChanges: archiveHistory.changes, olderArchives: archiveHistory.older, archivesBefore,
    archiveNow: offersArchiveNow(found.source.url, archives) }
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

async function archiveAction(event: RequestEvent, remove: boolean) {
  await guardWrite(event, 'EDITS')
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const value = (await event.request.formData()).get('archive')
  const db = env(event).DB
  const url = typeof value === 'string' ? archiveUrl(value) : null
  const result = url ? await editSourceArchive(db, id, url, remove, (await writer(event, db)).id) : 'invalid'
  if (result !== 'ok') return fail(400, { archiveError: result, archive: remove || typeof value !== 'string' ? '' : value.slice(0, ARCHIVE_URL_MAX) })
  notifyIndexNow(event, { sources: [id] })
  return { archiveError: null, archive: '' }
}

// Asks the Wayback Machine for a copy while the person waits, so the page shows it or says why not.
async function archiveNowAction(event: RequestEvent) {
  await guardWrite(event, 'EDITS')
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const db = env(event).DB
  const result = await archiveNow(db, id, (await writer(event, db)).id)
  if (!result.ok) return fail(result.error === 'failed' ? 502 : 400, { archiveError: result.error, archive: '' })
  notifyIndexNow(event, { sources: [id] })
  return { archiveError: null, archive: '' }
}

export const actions: Actions = {
  addAlias: event => aliasAction(event, false),
  removeAlias: event => aliasAction(event, true),
  addArchive: event => archiveAction(event, false),
  removeArchive: event => archiveAction(event, true),
  archiveNow: archiveNowAction,
}
