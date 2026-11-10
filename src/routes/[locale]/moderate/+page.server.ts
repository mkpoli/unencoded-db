import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { openReports, resolveReport, setHidden } from '$lib/server/entries'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { positiveId } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

function moderator(event: RequestEvent) {
  const person = event.locals.person
  if (!person?.moderator || person.banned) error(403)
  return person
}

const HIDDEN_PAGE = 100

export const load: PageServerLoad = async event => {
  moderator(event)
  const cursor = (name: string) => {
    const values = event.url.searchParams.getAll(name)
    if (!values.length) return null
    const id = values.length === 1 ? positiveId(values[0]) : null
    if (!id) error(404)
    return id
  }
  const reportsAfter = cursor('reportsAfter')
  const entryBefore = cursor('entriesBefore')
  const sightingBefore = cursor('sightingsBefore')
  const db = env(event).DB
  const [reports, entries, sightings] = await Promise.all([
    openReports(db, reportsAfter ?? 0),
    db.prepare(`SELECT id, ids, hidden_at FROM entries WHERE hidden_at IS NOT NULL AND id < ? ORDER BY id DESC LIMIT ${HIDDEN_PAGE + 1}`).bind(entryBefore ?? Number.MAX_SAFE_INTEGER).all<{ id: number; ids: string | null; hidden_at: string }>(),
    db.prepare(`SELECT s.id, s.entry_id, s.place, s.hidden_at, e.ids FROM sightings s JOIN entries e ON e.id = s.entry_id WHERE s.hidden_at IS NOT NULL AND s.id < ? ORDER BY s.id DESC LIMIT ${HIDDEN_PAGE + 1}`).bind(sightingBefore ?? Number.MAX_SAFE_INTEGER).all<{ id: number; entry_id: number; place: string; hidden_at: string; ids: string | null }>(),
  ])
  return {
    reports: reports.reports,
    nextReports: reports.next,
    cursors: { reportsAfter, entriesBefore: entryBefore, sightingsBefore: sightingBefore },
    hiddenEntries: entries.results.slice(0, HIDDEN_PAGE),
    hiddenSightings: sightings.results.slice(0, HIDDEN_PAGE),
    nextEntries: entries.results.length > HIDDEN_PAGE ? entries.results[HIDDEN_PAGE - 1].id : null,
    nextSightings: sightings.results.length > HIDDEN_PAGE ? sightings.results[HIDDEN_PAGE - 1].id : null,
  }
}

async function visibility(event: RequestEvent, hidden: boolean) {
  const person = moderator(event)
  await guardWrite(event, 'EDITS', true)
  const form = await event.request.formData()
  const values = form.getAll('report')
  const id = values.length === 1 && typeof values[0] === 'string' ? positiveId(values[0]) : null
  if (!id) return fail(400, { error: 'report' })
  const db = env(event).DB
  const report = await db.prepare('SELECT entry_id, sighting_id FROM reports WHERE id = ? AND resolved_at IS NULL').bind(id).first<{ entry_id: number; sighting_id: number | null }>()
  if (!report || !await setHidden(db, { entry: report.entry_id, sighting: report.sighting_id }, hidden, { actor: person.id, ip: await ipHash(event) }, null)) error(404)
  redirect(303, `/${event.params.locale}/moderate`)
}

async function restore(event: RequestEvent, sighting: boolean) {
  const person = moderator(event)
  await guardWrite(event, 'EDITS', true)
  const form = await event.request.formData()
  const values = form.getAll('id')
  const id = values.length === 1 && typeof values[0] === 'string' ? positiveId(values[0]) : null
  if (!id) return fail(400, { error: 'id' })
  const db = env(event).DB
  const target = sighting
    ? await db.prepare('SELECT entry_id FROM sightings WHERE id = ? AND hidden_at IS NOT NULL').bind(id).first<{ entry_id: number }>()
    : await db.prepare('SELECT id AS entry_id FROM entries WHERE id = ? AND hidden_at IS NOT NULL').bind(id).first<{ entry_id: number }>()
  if (!target || !await setHidden(db, { entry: target.entry_id, sighting: sighting ? id : null }, false, { actor: person.id, ip: await ipHash(event) }, null)) error(404)
  redirect(303, `/${event.params.locale}/moderate`)
}

export const actions: Actions = {
  restoreEntry: event => restore(event, false),
  restoreSighting: event => restore(event, true),
  hide: event => visibility(event, true),
  unhide: event => visibility(event, false),
  resolve: async event => {
    const person = moderator(event)
    await guardWrite(event, 'EDITS', true)
    const form = await event.request.formData()
    const values = form.getAll('report')
    const id = values.length === 1 && typeof values[0] === 'string' ? positiveId(values[0]) : null
    if (!id) return fail(400, { error: 'report' })
    const db = env(event).DB
    if (!await resolveReport(db, id, person.id)) error(404)
    redirect(303, `/${event.params.locale}/moderate`)
  },
}
