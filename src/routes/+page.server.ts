import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const before = url.searchParams.get('before')
  const id = before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before)) ? Number(before) : Number.MAX_SAFE_INTEGER
  const { results } = await platform.env.DB.prepare('SELECT id, script, ids, place, image_key FROM entries WHERE id < ? ORDER BY id DESC LIMIT 21').bind(id).all<{ id: number; script: string; ids: string | null; place: string; image_key: string | null }>()
  return { entries: results.slice(0, 20), next: results.length > 20 ? results[19].id : null }
}
