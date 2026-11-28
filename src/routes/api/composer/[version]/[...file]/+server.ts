import { composerUpstreamUrl, isComposerVersion } from '$lib/composer'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

const IMMUTABLE = 'public, max-age=31536000, immutable'
const MISSING = 'public, max-age=600'
const SAFE_FILE = /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/

const contentTypeFor = (file: string) =>
  /^[gp]\//.test(file) ? 'application/octet-stream' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream'

// Same-origin proxy for immutable versioned han-compose exports, reusing the R2 `composer/<version>/<file>`
// cache populated by server-side glyph drawing. Keeps browser-side composition working where *.workers.dev
// is unreachable.
export const GET: RequestHandler = async event => {
  const { version, file } = event.params
  if (!isComposerVersion(version) || !SAFE_FILE.test(file) || file.split('/').some(seg => seg === '.' || seg === '..')) {
    return new Response(null, { status: 404 })
  }
  const type = contentTypeFor(file)
  const key = `composer/${version}/${file}`
  const bucket = env(event).MEDIA
  try {
    const stored = await bucket.get(key)
    if (stored) {
      return new Response(await stored.arrayBuffer(), {
        headers: { 'content-type': type, 'cache-control': IMMUTABLE },
      })
    }
  } catch {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  let upstream: Response
  try {
    upstream = await fetch(composerUpstreamUrl(version, file))
  } catch {
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
  if (upstream.status === 404) {
    return new Response(null, { status: 404, headers: { 'cache-control': MISSING } })
  }
  if (!upstream.ok) {
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
  const bytes = await upstream.arrayBuffer()
  const store = bucket.put(key, bytes, { httpMetadata: { contentType: type } }).catch(() => {})
  if (event.platform?.ctx) event.platform.ctx.waitUntil(store)
  else await store
  return new Response(bytes, {
    headers: { 'content-type': type, 'cache-control': IMMUTABLE },
  })
}
