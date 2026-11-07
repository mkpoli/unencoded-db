import { isIP } from 'node:net'
import { limitWriteBody } from '$lib/server/body-limit'
import type { Handle, RequestEvent } from '@sveltejs/kit'

function rateLimitKey(event: RequestEvent): string | null {
  const address = event.getClientAddress()
  // Local mode shares one bucket and must only be served on loopback.
  if (event.platform?.env.LOCAL_RATE_LIMIT === 'true') {
    return ['localhost', '127.0.0.1', '[::1]'].includes(event.url.hostname) &&
      ['127.0.0.1', '::1'].includes(address) ? 'local-loopback' : null
  }
  // Cloudflare supplies cf metadata and overwrites CF-Connecting-IP at its edge.
  if (!event.platform?.cf) return null
  const version = isIP(address)
  if (version === 4) return address
  if (version === 6) {
    const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1)
    if (canonical.startsWith('::ffff:')) return null
    const [head, tail] = canonical.split('::')
    const left = head ? head.split(':') : []
    const right = tail ? tail.split(':') : []
    const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    return `ipv6-64:${groups.slice(0, 4).map(group => group.padStart(4, '0')).join(':')}`
  }
  return null
}

function unavailable(request: Request, message = 'Rate limit unavailable'): Response {
  const enhanced = request.headers.get('x-sveltekit-action') === 'true'
  return new Response(enhanced ? JSON.stringify({ type: 'failure', status: 503 }) : message, {
    status: 503,
    headers: { 'content-type': enhanced ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  })
}

const limitedPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Too many requests · 珍字集覽</title><style>:root{font:16px/1.6 system-ui,sans-serif;color-scheme:light dark}body{margin:0;background:#f8f8f9;color:#19191c}main{max-width:42rem;margin:3rem auto;padding:0 1rem}h1{line-height:1.25}@media(prefers-color-scheme:dark){body{background:#111114;color:#e6e6ea}}</style></head><body><main><h1>Too many requests</h1><p>Try again in a minute.</p></main></body></html>`

export const handle: Handle = async ({ event, resolve }) => {
  if (event.request.method === 'POST' && event.route.id === '/new') {
    if (event.platform?.env?.NEW_RECORDS_PAUSED !== '0') return unavailable(event.request, 'Contributions are temporarily unavailable')
    try {
      const key = rateLimitKey(event)
      const limiter = event.platform?.env.CONTRIBUTION_RATE_LIMIT
      if (!key || !limiter) return unavailable(event.request)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
      const opaqueKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const result = await limiter.limit({ key: opaqueKey })
      if (result?.success === false) {
        const enhanced = event.request.headers.get('x-sveltekit-action') === 'true'
        // use:enhance expects a serialized ActionResult, even before an action runs.
        const body = enhanced ? JSON.stringify({ type: 'failure', status: 429 }) : limitedPage
        return new Response(body, { status: 429, headers: { 'content-type': enhanced ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'retry-after': '60' } })
      }
      if (result?.success !== true) return unavailable(event.request)
    } catch {
      return unavailable(event.request)
    }
  }
  if (event.request.method === 'POST') {
    const request = await limitWriteBody(event.request)
    if (!request) return new Response('Request too large', { status: 413 })
    event.request = request
  }
  return resolve(event)
}
