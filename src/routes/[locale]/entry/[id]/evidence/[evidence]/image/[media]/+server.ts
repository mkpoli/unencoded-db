import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform) error(500, 'Storage unavailable')
  if (!/^[1-9]\d*$/.test(params.id) || !/^[1-9]\d*$/.test(params.evidence) || !/^[1-9]\d*$/.test(params.media)) error(404)
  const row = await platform.env.DB.prepare(`SELECT m.key, m.type FROM evidence_media em JOIN media m ON m.id = em.media_id JOIN evidence ev ON ev.id = em.evidence_id JOIN entries e ON e.id = ev.entry_id AND ${publicEntryPredicate} WHERE em.evidence_id = ? AND em.media_id = ? AND ev.entry_id = ?`).bind(Number(params.evidence), Number(params.media), Number(params.id)).first<{ key: string; type: string }>()
  if (!row) error(404)
  const object = await platform.env.IMAGES.get(row.key)
  if (!object) error(404)
  return new Response(object.body, { headers: { 'content-type': row.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
