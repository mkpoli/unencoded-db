import { error } from '@sveltejs/kit'
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
}

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!platform) error(500, 'Database unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const entry = await platform.env.DB.prepare(
    `SELECT id, script, ids, description, place, title, author, publisher, year, page, note, created_at,
            (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(Number(params.id)).first<Entry>()
  if (!entry) error(404)
  return { entry }
}
