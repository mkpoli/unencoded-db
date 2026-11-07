import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { RequestHandler } from './$types'

type ImageRow = { image_key: string | null; image_type: string | null }

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform) error(500, 'Storage unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !Number.isSafeInteger(Number(params.id))) error(404)
  const row = await platform.env.DB.prepare(`SELECT image_key, image_type FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(Number(params.id)).first<ImageRow>()
  if (!row?.image_key || !row.image_type) error(404)
  const object = await platform.env.IMAGES.get(row.image_key)
  if (!object) error(404)
  return new Response(object.body, {
    headers: {
      'Content-Type': row.image_type,
      'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
