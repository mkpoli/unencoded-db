import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  const genre = await platform.env.DB.prepare('SELECT slug, label FROM genres WHERE slug = ?').bind(params.slug).first<{ slug: string; label: string }>()
  if (!genre) error(404)
  const { results } = await platform.env.DB.prepare(`SELECT e.id, e.script, e.ids, e.description FROM entries e JOIN entry_genres eg ON eg.entry_id = e.id AND eg.genre = ? WHERE ${publicEntryPredicate} ORDER BY e.id DESC LIMIT 21`).bind(params.slug).all<{ id: number; script: string; ids: string | null; description: string | null }>()
  return { genre, entries: results }
}
