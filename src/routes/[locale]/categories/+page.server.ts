import { fail, redirect } from '@sveltejs/kit'
import { counts } from '$lib/server/entries'
import { createCategory, customGenres } from '$lib/server/categories'
import { readNewGenre } from '$lib/genres'
import { env, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const db = env(event).DB
  const [totals, custom] = await Promise.all([counts(db), customGenres(db)])
  return { counts: totals, custom }
}

export const actions: Actions = {
  // A category under a built-in or added one, or at the top. The hook has already limited the write.
  add: async (event) => {
    const asked = readNewGenre(await event.request.formData())
    if (!asked || asked === 'invalid') return fail(400, { error: 'category' })
    const { DB } = env(event)
    const person = await writer(event, DB)
    const result = await createCategory(DB, asked, { actor: person.id, ip: await ipHash(event) })
    if (!result.ok) return fail(400, { error: 'category' })
    redirect(303, `/${event.params.locale}/categories`)
  },
}
