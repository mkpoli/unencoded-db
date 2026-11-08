import { error } from '@sveltejs/kit'
import { MAX_COMPARISONS, type Comparison } from '$lib/server/related'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

type Entry = {
  id: number
  script: string
  ids: string | null
  description: string | null
  place: string
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  created_at: string
  has_image: number
  comparisons: string
}

export const load: PageServerLoad = async ({ params, platform, locals, url }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const row = await platform.env.DB.prepare(
    `SELECT id, script, ids, description, place, title, author, publisher, year, page, note, created_at,
            (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image, comparisons
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(Number(params.id)).first<Entry>()
  if (!row) error(404)
  const { comparisons: stored, ...entry } = row
  const comparisons = JSON.parse(stored) as Comparison[]
  if (!Array.isArray(comparisons) || comparisons.length > MAX_COMPARISONS) error(500, 'Invalid related characters')
  return { entry, comparisons, isModerator: Boolean(locals?.moderator), reported: url?.searchParams.get('reported') === '1' }
}
