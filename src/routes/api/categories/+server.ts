import { json } from '@sveltejs/kit'
import { createCategory } from '$lib/server/categories'
import { readNewGenre } from '$lib/genres'
import { env, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { RequestHandler } from './$types'

// A category added from the record form before the record is saved. The hook has already limited the write.
export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData()
  const asked = readNewGenre(form)
  if (!asked || asked === 'invalid') return json({ error: 'category' }, { status: 400 })
  const { DB } = env(event)
  const person = await writer(event, DB)
  const result = await createCategory(DB, asked, { actor: person.id, ip: await ipHash(event) })
  return result.ok ? json({ value: result.value, created: result.created }) : json({ error: 'category', code: result.code }, { status: 400 })
}
