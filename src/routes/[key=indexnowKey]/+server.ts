import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// IndexNow checks that the key is served as plain text at /<key>.txt.
export const GET: RequestHandler = event => {
  const key = event.platform?.env?.INDEXNOW_KEY
  if (!key || event.params.key !== `${key}.txt`) error(404)
  return new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
