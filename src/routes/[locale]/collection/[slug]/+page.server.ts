import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  const collection = await platform.env.DB.prepare('SELECT slug, label FROM collections WHERE slug = ?').bind(params.slug).first<{ slug: string; label: string }>()
  if (!collection) error(404)
  const { results } = await platform.env.DB.prepare(`SELECT e.id, e.script, e.ids, e.description, ev.place AS source_place, ev.year AS source_year FROM entries e JOIN entry_collections ec ON ec.entry_id = e.id AND ec.collection = ? LEFT JOIN evidence ev ON ev.id = ec.evidence_id WHERE ${publicEntryPredicate} ORDER BY e.id DESC LIMIT 21`).bind(params.slug).all<{ id: number; script: string; ids: string | null; description: string | null; source_place: string | null; source_year: string | null }>()
  return { collection, entries: results }
}
