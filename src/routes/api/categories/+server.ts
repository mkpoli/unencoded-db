import { json } from '@sveltejs/kit'
import { categoryList, createCategory, deleteCategory, moveCategory, renameCategory, undoChange } from '$lib/server/categories'
import { env, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { RequestHandler } from './$types'

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim().normalize('NFC')
const number = (form: FormData, name: string) => field(form, name) ? Number(field(form, name)) : Number.NaN
const STATUS: Record<string, number> = { missing: 404, conflict: 409, slow: 429 }

// Every change to the categories: `action` is create, move, rename, delete or undo; `name` the category,
// and `rev` the revision of it the writer read, or `id` the change to undo. The hook has already limited the
// write; everything else is checked here against the categories as they stand, and again as it is written.
export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData()
  const action = field(form, 'action'), name = field(form, 'name'), rev = number(form, 'rev'), id = number(form, 'id')
  if (!['create', 'move', 'rename', 'delete', 'undo'].includes(action) || (action === 'undo' ? !Number.isSafeInteger(id) : !name)) return json({ error: 'category' }, { status: 400 })
  if (['move', 'rename', 'delete'].includes(action) && !Number.isSafeInteger(rev)) return json({ error: 'category' }, { status: 400 })
  const { DB } = env(event)
  const categories = await categoryList(DB)
  const person = await writer(event, DB)
  const who = { actor: person.id, ip: await ipHash(event) }
  const parent = field(form, 'parent') || null
  const refused = (code: string) => json({ ok: false, error: 'category', code }, { status: STATUS[code] ?? 400 })
  if (action === 'create') {
    const made = await createCategory(DB, categories, { name, parent }, who)
    return made.ok ? json({ value: made.value, created: made.created }) : refused(made.code)
  }
  const result = action === 'move' ? await moveCategory(DB, categories, { name, parent, position: number(form, 'position'), rev }, who)
    : action === 'rename' ? await renameCategory(DB, categories, { name, label: field(form, 'label'), rev }, who)
    : action === 'delete' ? await deleteCategory(DB, categories, { name, rev }, who)
    : await undoChange(DB, categories, id, who)
  return result.ok ? json({ ok: true }) : refused(result.code)
}
