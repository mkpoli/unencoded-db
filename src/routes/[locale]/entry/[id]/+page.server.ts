import { error, fail, redirect } from '@sveltejs/kit'
import { editEntry, getEntry, readEntryFields, validRelatedFields } from '$lib/server/entries'
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
  return { entry: found.entry, sightings: found.sightings.filter(s => !s.hidden_at) }
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
    const values = readEntryFields(form, found.entry)
    if (!validRelatedFields(form)) return fail(400, { error: 'relatedCharacters', values })
    const rev = positiveId(String(form.get('rev') ?? ''))
    if (!rev || rev !== found.entry.rev) return fail(409, { error: 'conflict', values })
    const person = await writer(event, DB)
    const summary = String(form.get('summary') ?? '').trim().slice(0, 500) || null
    const result = await editEntry(DB, id, rev, values, { actor: person.id, ip: await ipHash(event) }, summary)
    if (!result.ok) return fail(result.code === 'conflict' ? 409 : 404, { error: result.code, values })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
