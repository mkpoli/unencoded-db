import { error } from '@sveltejs/kit'
import { MAX_COMPARISONS } from '$lib/server/related'
import type { PageServerLoad } from './$types'
export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const entry = await platform.env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(Number(params.id)).first<{ id: number; script: string; ids: string | null; description: string | null; place: string; url: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string; comparisons: string }>()
  if (!entry) error(404)
  const comparisons = JSON.parse(entry.comparisons) as { character: string; relationship: string; differences: string; evidence: string }[]
  if (!Array.isArray(comparisons) || comparisons.length > MAX_COMPARISONS) error(500, 'Invalid related characters')
  return { entry, comparisons }
}
