import { fail } from '@sveltejs/kit'
import { cleanName } from '$lib/server/people'
import { env, guardWrite } from '$lib/server/guard'
import type { Actions } from './$types'

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const person = event.locals.person
    if (!person) return fail(403, { error: 'missing' })
    const name = cleanName((await event.request.formData()).get('name'))
    if (!name) return fail(400, { error: 'name' })
    await env(event).DB.prepare('UPDATE people SET name = ? WHERE id = ?').bind(name, person.id).run()
    return { saved: true }
  },
}
