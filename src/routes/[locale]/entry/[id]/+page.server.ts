import { createCategory, customGenres } from '$lib/server/categories'
import { error, fail, redirect } from '@sveltejs/kit'
import { earliestSighting, editEntry, getEntry, radicalCounts, readEntryFields } from '$lib/server/entries'
import { cleanGenre, readNewGenre } from '$lib/genres'
import { newClaim } from '$lib/claims'
import { filedUnder, radicalPath } from '$lib/radicals'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId } from '../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await getEntry(env(event).DB, id)
  if (!found || found.entry.hidden_at) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/entry/${found.entry.merged_into}`)
  // The radicals the record is filed under, from the Kangxi radical down to the branch that holds it.
  const path = radicalPath(found.entry.ids, found.entry.radical)
  const held = path ? await radicalCounts(env(event).DB, path[0]) : null
  const filed = path && held ? filedUnder(path, held.counts, held.stated).map(({ path, radical }) => ({ path, radical })) : []
  const sightings = found.sightings.filter(s => !s.hidden_at)
  // The record's earliest attestation, and which piece of evidence holds it.
  const earliest = earliestSighting(sightings)
  return { entry: found.entry, claims: found.claims, sightings, filed, customGenres: await customGenres(env(event).DB), earliest: earliest && { year: earliest.text, kind: earliest.kind, sighting: earliest.sighting.id } }
}

export const actions: Actions = {
  edit: async (event) => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    if (!id) error(404)
    const { DB } = env(event)
    const found = await getEntry(DB, id)
    if (!found || found.entry.hidden_at || found.entry.merged_into) error(404)
    const form = await event.request.formData()
    const { fields: read, error: claimError } = readEntryFields(form, { ...found.entry, claims: found.claims })
    // A category typed into the form without scripts is made with the edit and filed under.
    const fresh = readNewGenre(form)
    const named = fresh && fresh !== 'invalid' ? cleanGenre(fresh.name)! : null
    const values = named && !read.claims.some(claim => claim.kind === 'genre' && claim.value === named) ? { ...read, claims: [...read.claims, newClaim('genre', named)] } : read
    if (claimError) return fail(400, { error: claimError, values })
    if (fresh === 'invalid') return fail(400, { error: 'category', values })
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== found.entry.rev) return fail(409, { error: 'conflict', values })
    const person = await writer(event, DB)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500) || null
    const who = { actor: person.id, ip: await ipHash(event) }
    if (fresh && !(await createCategory(DB, fresh, who)).ok) return fail(400, { error: 'category', values })
    const result = await editEntry(DB, id, rev, values, who, summary)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code, values })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
