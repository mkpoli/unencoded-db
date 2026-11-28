import { recordCode } from '$lib/code'
import { readDates, sightingDates } from '$lib/server/date-readings'
import { createTag, taxonomy } from '$lib/server/tags'
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { addComment, cleanComment, commentsOf, setCommentHidden } from '$lib/server/comments'
import { isDescription } from 'ids-input'
import { cleanIds } from '$lib/ids'
import { earliestSighting, editEntry, evidenceOrder, getEntry, radicalCounts, readEntryFields } from '$lib/server/entries'
import { readNewTag } from '$lib/tags'
import { newClaim } from '$lib/claims'
import { filedUnder, radicalPath } from '$lib/radicals'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { scheduleAtlasSync } from '$lib/server/atlas-evidence'
import { notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { relatedRecords } from '$lib/server/related-records'
import { archivesOfSources } from '$lib/server/source-archives'
import { positiveId, recordIdParam } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = recordIdParam(event.params.code)
  if (!id) error(404)
  const found = await getEntry(env(event).DB, id)
  if (!found || found.entry.hidden_at) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/${recordCode(found.entry.merged_into)}`)
  // The radicals the record is filed under, from the Kangxi radical down to the branch that holds it.
  const path = radicalPath(found.entry.ids, found.entry.radical)
  const held = path ? await radicalCounts(env(event).DB, path[0]) : null
  const filed = path && held ? filedUnder(path, held.counts, held.stated).map(({ path, radical }) => ({ path, radical })) : []
  const shown = found.sightings.filter(s => !s.hidden_at)
  // The archived copies of every source the evidence cites, as a work or a go-between.
  const cited = shown.flatMap(sighting => [sighting.source_id, ...sighting.vias.map(via => via.id)]).filter(id => id !== null)
  const [dates, archives] = await Promise.all([readDates(env(event).DB, sightingDates(shown)), archivesOfSources(env(event).DB, cited)])
  const sightings = evidenceOrder(shown, dates)
  // The record's earliest attestation, and which piece of evidence holds it.
  const earliest = earliestSighting(sightings, dates)
  // A description another page proposes to add, ?ids_add=: one, and only a whole one. It is added to the form, not saved.
  const proposed = cleanIds(event.url.searchParams.get('ids_add') ?? '')
  const idsAdd = isDescription(proposed) ? proposed : null
  // The evidence a comment is to be about, ?about=: one of the record's own.
  const asked = positiveId(event.url.searchParams.get('about') ?? '')
  const about = asked && sightings.some(sighting => sighting.id === asked) ? asked : null
  const comments = await commentsOf(env(event).DB, id, Boolean(event.locals.person?.moderator))
  const related = await relatedRecords(env(event).DB, id, found.claims)
  return { dates, archives, idsAdd, related, about, comments, entry: found.entry, claims: found.claims, sightings, filed, ...(await taxonomy(env(event).DB)), earliest: earliest && { year: earliest.text, kind: earliest.kind, sighting: earliest.sighting.id } }
}

async function commentVisibility(event: RequestEvent, hidden: boolean) {
  await guardWrite(event, 'EDITS', true)
  const id = recordIdParam(event.params.code)
  const comment = positiveId(String((await event.request.formData()).get('comment') ?? ''))
  if (!id || !comment || !await setCommentHidden(env(event).DB, id, comment, hidden, event.locals.person!.id)) error(404)
  redirect(303, `/${event.params.locale}/${recordCode(id)}#comment-${comment}`)
}

export const actions: Actions = {
  comment: async (event) => {
    await guardWrite(event, 'EDITS')
    const id = recordIdParam(event.params.code)
    if (!id) error(404)
    const { DB } = env(event)
    const found = await getEntry(DB, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    const asked = String(form.get('about') ?? '')
    const about = asked ? positiveId(asked) : null
    if (asked && !found.sightings.some(sighting => sighting.id === about && !sighting.hidden_at)) error(404)
    const body = cleanComment(form.get('body'))
    if (!body) return fail(400, { error: 'comment', comment: String(form.get('body') ?? '').slice(0, 20000), about })
    const person = await writer(event, DB)
    const comment = await addComment(DB, { entry: id, sighting: about }, body, { actor: person.id, ip: await ipHash(event) })
    redirect(303, `/${event.params.locale}/${recordCode(id)}#comment-${comment}`)
  },
  hideComment: event => commentVisibility(event, true),
  unhideComment: event => commentVisibility(event, false),
  edit: async (event) => {
    await guardWrite(event, 'EDITS')
    const id = recordIdParam(event.params.code)
    if (!id) error(404)
    const { DB } = env(event)
    const found = await getEntry(DB, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    const { tags, groups } = await taxonomy(DB)
    const { fields: read, error: claimError } = readEntryFields(form, tags, { ...found.entry, claims: found.claims })
    // A tag typed into the form without scripts is made with the edit and attached.
    const fresh = readNewTag(form, tags)
    const named = fresh && fresh !== 'invalid' ? fresh.name : null
    const values = named && !read.claims.some(claim => claim.kind === 'tag' && claim.value === named) ? { ...read, claims: [...read.claims, newClaim('tag', named)] } : read
    if (claimError) return fail(400, { error: claimError, values })
    if (fresh === 'invalid') return fail(400, { error: 'tag', values })
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== found.entry.rev) return fail(409, { error: 'conflict', values })
    const person = await writer(event, DB)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500) || null
    const who = { actor: person.id, ip: await ipHash(event) }
    if (fresh && !(await createTag(DB, tags, fresh, who, groups)).ok) return fail(400, { error: 'tag', values })
    const result = await editEntry(DB, id, rev, values, who, summary)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code, values })
    notifyIndexNow(event, { entries: [id] })
    scheduleAtlasSync(event, [id], { onlyIfChanged: true })
    redirect(303, `/${event.params.locale}/${recordCode(id)}`)
  },
}
