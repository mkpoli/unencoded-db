import { isIP } from 'node:net'
import { limitWriteBody, writeBodyLimit } from '$lib/server/body-limit'
import { localeFromPathname, localizedHref, t, type Locale } from '$lib/i18n'
import type { Handle, RequestEvent } from '@sveltejs/kit'

const NEW_ROUTE = '/[locale]/new'

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

function isEnhanced(request: Request): boolean {
  return request.headers.get('x-sveltekit-action') === 'true'
}

function unavailable(request: Request, locale: Locale): Response {
  const enhanced = isEnhanced(request)
  return new Response(enhanced ? JSON.stringify({ type: 'failure', status: 503 }) : t(locale, 'error.rateUnavailable'), {
    status: 503,
    headers: { 'content-type': enhanced ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
  })
}

const limitedPageStyle = `:root{color-scheme:light dark;--paper:#fafafa;--surface:#fff;--ink:#19191c;--muted:#6f6f78;--line:#e3e3e7;--accent:#6356e5;--wrong:#be3d49;--font:Inter,"Helvetica Neue",Arial,"Noto Sans",sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}@media(prefers-color-scheme:dark){:root{--paper:#121215;--surface:#1b1b1f;--ink:#e6e6ea;--muted:#9d9da6;--line:#2e2e35;--accent:#9c92ff;--wrong:#ff929f}}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 var(--font)}main{max-width:42rem;margin:0 auto;padding:48px 20px}.status{font:600 12px/1 var(--mono);letter-spacing:.08em;color:var(--wrong);text-transform:uppercase}h1{font-size:34px;line-height:1.15;margin:12px 0}p{color:var(--muted);margin:0 0 24px}a{display:inline-block;padding:10px 14px;border:1px solid var(--line);border-radius:6px;color:var(--ink);text-decoration:none}`

function limitedPage(locale: Locale): string {
  const title = t(locale, 'error.rateLimitTitle')
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title} · ${t(locale, 'app.name')}</title><style>${limitedPageStyle}</style></head><body><main><p class="status">429</p><h1>${title}</h1><p>${t(locale, 'error.rateLimit')}</p><a href="${localizedHref(locale)}">${t(locale, 'error.home')}</a></main></body></html>`
}

export const handle: Handle = async ({ event, resolve }) => {
  const locale = localeFromPathname(event.url.pathname) ?? 'en'
  if (event.request.method === 'POST' && event.route?.id === NEW_ROUTE) {
    try {
      const key = rateLimitKey(event)
      const limiter = event.platform?.env.CONTRIBUTION_RATE_LIMIT
      if (!key || !limiter) return unavailable(event.request, locale)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
      const opaqueKey = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const result = await limiter.limit({ key: opaqueKey })
      if (result?.success === false) {
        const enhanced = isEnhanced(event.request)
        // use:enhance expects a serialized ActionResult, even before an action runs.
        const body = enhanced ? JSON.stringify({ type: 'failure', status: 429 }) : limitedPage(locale)
        return new Response(body, { status: 429, headers: { 'content-type': enhanced ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'retry-after': '60' } })
      }
      if (result?.success !== true) return unavailable(event.request, locale)
    } catch {
      return unavailable(event.request, locale)
    }
  }
  if (event.request.method === 'POST') {
    const request = await limitWriteBody(event.request, writeBodyLimit(event.url.pathname))
    if (!request) return new Response(t(locale, 'error.tooLarge'), { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    event.request = request
  }
  return resolve(event, { transformPageChunk: ({ html }) => html.replace(/<html lang="%lang%"/, `<html lang="${locale}"`) })
}
