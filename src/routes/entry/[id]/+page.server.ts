import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { publicEntryPredicate } from '$lib/server/visibility'
export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const entry = await platform.env.DB.prepare(`SELECT * FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(Number(params.id)).first<{ id: number; script: string; ids: string | null; description: string | null; place: string; url: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string }>()
  if (!entry) error(404)
  return { entry }
}
