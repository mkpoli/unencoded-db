import { error } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { atlasPicture } from '$lib/server/atlas'
import { atlasSubOf } from '$lib/server/people'
import type { RequestHandler } from './$types'

/** The picture a person chose on Glyph Atlas, handed on so that a reader's browser asks no other site for it
 * and the account's own id stays unsaid. */
export const GET: RequestHandler = async event => {
  if (!/^[0-9a-f]{12}$/.test(event.params.id)) error(404)
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default
  const address = new Request(`${event.url.origin}${event.url.pathname}`)
  const found = await cache?.match(address)
  if (found) return new Response(found.body, found)
  const sub = await atlasSubOf(env(event).DB, event.params.id)
  const picture = sub ? await atlasPicture(event, sub) : null
  const response = picture
    ? new Response(picture.body, { headers: { 'content-type': picture.type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } })
    : new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=300' } })
  if (cache) event.platform?.ctx.waitUntil(cache.put(address, response.clone()))
  return response
}
