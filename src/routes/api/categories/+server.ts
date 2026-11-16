import { json } from '@sveltejs/kit'
import { categoryList, createCategory, deleteCategory, moveCategory, renameCategory } from '$lib/server/categories'
import { env, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { RequestHandler } from './$types'

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim().normalize('NFC')

// Every change to the categories: `action` is create, move, rename or delete, and `name` the category. The
// hook has already limited the write; everything else is checked here against the categories as they stand.
export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData()
  const action = field(form, 'action'), name = field(form, 'name')
  if (!['create', 'move', 'rename', 'delete'].includes(action) || !name) return json({ error: 'category' }, { status: 400 })
  const { DB } = env(event)
  const categories = await categoryList(DB)
  const person = await writer(event, DB)
  const who = { actor: person.id, ip: await ipHash(event) }
  const parent = field(form, 'parent') || null
  const refused = (code: string) => json({ error: 'category', code }, { status: code === 'missing' ? 404 : 400 })
  if (action === 'create') {
    const made = await createCategory(DB, categories, { name, parent }, who)
    return made.ok ? json({ value: made.value, created: made.created }) : refused(made.code)
  }
  const result = action === 'move' ? await moveCategory(DB, categories, { name, parent, position: field(form, 'position') ? Number(field(form, 'position')) : Number.NaN }, who)
    : action === 'rename' ? await renameCategory(DB, categories, { name, label: field(form, 'label') }, who)
    : await deleteCategory(DB, categories, name, who)
  return result.ok ? json({ ok: true }) : refused(result.code)
}
