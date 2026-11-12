import { mediaVisible } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { TYPE_OF_EXTENSION } from '$lib/server/image'
import type { RequestHandler } from './$types'

const NOT_FOUND = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })

export const GET: RequestHandler = async (event) => {
  const match = /^v2\/([a-f0-9]{64}\.(?:jpg|png|webp))$/.exec(event.params.key)
  if (!match) return NOT_FOUND()
  const key = match[1]
  const bindings = env(event)
  if (!await mediaVisible(bindings.DB, key)) return NOT_FOUND()
  const object = await bindings.MEDIA.get(key)
  if (!object) return NOT_FOUND()
  const type = TYPE_OF_EXTENSION[key.slice(key.lastIndexOf('.') + 1)]
  return new Response(object.body, { headers: { 'content-type': type, 'cache-control': 'no-store', etag: object.httpEtag, 'x-content-type-options': 'nosniff' } })
}
