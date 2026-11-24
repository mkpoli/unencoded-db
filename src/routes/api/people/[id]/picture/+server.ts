import { error } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { atlasPicture } from '$lib/server/atlas'
import { atlasSubOf, PERSON_ID } from '$lib/server/people'
import type { RequestHandler } from './$types'

const none = (control: string, status = 404) => new Response(null, { status, headers: { 'cache-control': control } })

/** The picture a person chose on Glyph Atlas, handed on so that a reader's browser asks no other site for it
 * and the account's own id stays unsaid. */
export const GET: RequestHandler = async event => {
  if (!PERSON_ID.test(event.params.id)) error(404)
  const sub = await atlasSubOf(env(event).DB, event.params.id)
  if (!sub) return none('no-store')
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default
  const address = new Request(`${event.url.origin}${event.url.pathname}`)
  const found = await cache?.match(address)
  if (found) return new Response(found.body, found)
  const picture = await atlasPicture(event, sub)
  // One refusal or delay says nothing of the next, so it is not kept.
  if (picture === undefined) return none('no-store', 502)
  const response = picture
    ? new Response(picture.body, { headers: { 'content-type': picture.type, 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' } })
    : none('public, max-age=300')
  if (cache) event.platform?.ctx.waitUntil(cache.put(address, response.clone()).catch(cause => console.error('Could not cache picture', cause)))
  return response
}
