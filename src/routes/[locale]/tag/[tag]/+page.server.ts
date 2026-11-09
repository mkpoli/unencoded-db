import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  const tag = decodeURIComponent(params.tag).normalize('NFC').trim()
  if (!tag || tag.length > 40) error(404)
  const { results } = await platform.env.DB.prepare(`SELECT e.id, e.script, e.ids, e.description FROM entries e JOIN character_tags t ON t.entry_id = e.id AND t.tag = ? WHERE ${publicEntryPredicate} ORDER BY e.id DESC LIMIT 21`).bind(tag).all<{ id: number; script: string; ids: string | null; description: string | null }>()
  return { tag, entries: results }
}
