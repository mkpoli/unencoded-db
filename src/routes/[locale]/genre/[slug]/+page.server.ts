import { error } from '@sveltejs/kit'
import { genreFamily, listGenres } from '$lib/server/genres'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  const genre = await platform.env.DB.prepare('SELECT slug, label, parent FROM genres WHERE slug = ?').bind(params.slug).first<{ slug: string; label: string; parent: string | null }>()
  if (!genre) error(404)
  const family = await genreFamily(platform.env.DB, params.slug)
  const [{ results }, genres] = await Promise.all([
    platform.env.DB.prepare(`SELECT e.id, e.script, e.ids, e.description FROM entries e JOIN entry_genres eg ON eg.entry_id = e.id AND eg.genre IN (${family.map(() => '?').join(', ')}) WHERE ${publicEntryPredicate} ORDER BY e.id DESC LIMIT 21`).bind(...family).all<{ id: number; script: string; ids: string | null; description: string | null }>(),
    listGenres(platform.env.DB),
  ])
  return { genre, genres, entries: results }
}
