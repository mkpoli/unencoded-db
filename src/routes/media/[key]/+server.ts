import { TYPE_OF_EXTENSION } from '$lib/server/image'
import type { RequestHandler } from './$types'
export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform || !/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(params.key)) return new Response(null, { status: 404 })
  const exists = await platform.env.DB.prepare('SELECT 1 FROM entries WHERE image_key = ? LIMIT 1').bind(params.key).first()
  if (!exists) return new Response(null, { status: 404 })
  const image = await platform.env.MEDIA.get(params.key)
  if (!image) return new Response(null, { status: 404 })
  return new Response(image.body, { headers: { 'content-type': TYPE_OF_EXTENSION[params.key.split('.').pop()!], 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } })
}
