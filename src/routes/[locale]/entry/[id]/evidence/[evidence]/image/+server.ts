import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform) error(500, 'Storage unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !/^[1-9]\d*$/.test(params.evidence)) error(404)
  const row = await platform.env.DB.prepare(`SELECT ev.image_key, ev.image_type FROM evidence ev JOIN entries e ON e.id = ev.entry_id AND ${publicEntryPredicate} WHERE ev.id = ? AND ev.entry_id = ?`).bind(Number(params.evidence), Number(params.id)).first<{ image_key: string | null; image_type: string | null }>()
  if (!row?.image_key || !row.image_type) error(404)
  const object = await platform.env.IMAGES.get(row.image_key)
  if (!object) error(404)
  return new Response(object.body, { headers: { 'content-type': row.image_type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
