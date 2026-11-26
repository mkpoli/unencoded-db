import { error, redirect } from '@sveltejs/kit'
import { tileGlyphs } from '$lib/server/glyphs'
import { env, guardWrite, ipHash } from '$lib/server/guard'
import { getImport, importEntries, setEntryReviewed } from '$lib/server/imports'
import { writer } from '$lib/server/people'
import { positiveId } from '../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const rawView = event.url.searchParams.get('view')
  if (rawView !== null && rawView !== 'pending' && rawView !== 'all') error(404)
  const pendingOnly = rawView !== 'all'
  const rawAfter = event.url.searchParams.get('after')
  const after = rawAfter === null ? null : positiveId(rawAfter)
  if (rawAfter !== null && !after) error(404)
  const { DB } = env(event)
  const batch = await getImport(DB, id)
  if (!batch) error(404)
  const page = await importEntries(DB, id, { pendingOnly, after })
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.entries, event.locals.glyphStyle)
  return { batch, view: pendingOnly ? 'pending' as const : 'all' as const, entries: page.entries, next: page.next, glyphs }
}

export const actions: Actions = {
  review: async (event) => {
    await guardWrite(event, 'EDITS')
    const id = positiveId(event.params.id)
    if (!id) error(404)
    const form = await event.request.formData()
    const entryId = positiveId(String(form.get('entry') ?? ''))
    if (!entryId) error(400)
    const reviewed = form.get('reviewed') !== '0'
    const view = form.get('view') === 'all' ? '?view=all' : ''
    const { DB } = env(event)
    const person = await writer(event, DB)
    const result = await setEntryReviewed(DB, entryId, reviewed, { actor: person.id, ip: await ipHash(event) }, id)
    if (!result.ok) error(404)
    redirect(303, `/${event.params.locale}/imports/${id}${view}`)
  },
}
