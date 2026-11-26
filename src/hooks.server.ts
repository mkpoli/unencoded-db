import { GLYPH_STYLE_COOKIE, glyphStyleOf } from '$lib/composer'
import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit'
import { isLocale, LOCALE_COOKIE, negotiate } from '$lib/i18n'
import { agentToken, loopback, personOf, sessionName } from '$lib/server/people'
import { bearerOf, tokenPerson } from '$lib/server/agents'
import { limitWriteBody, MAX_AGENT_BODY, MAX_PICTURES_BODY } from '$lib/server/body-limit'
import { guardWrite, moderationAction, writeLimitFor } from '$lib/server/guard'
import { TILE_SIZE_COOKIE, tileSizeOf } from '$lib/tile-size'

const UNPREFIXED = /^\/(media|api|auth|mcp|oauth\/(register|token|revoke)$|\.well-known\/|_app|robots\.txt|favicon|sitemap(?:-[\w-]+)?\.xml$)/

// A form post changes things under the visitor's cookie, so it must come from this site's own pages: the
// rule SvelteKit applies by itself when left to. The token endpoints of agent sign-in are posted to by
// clients outside any browser, which send no origin, and do nothing on the strength of a cookie.
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/x-sveltekit-formdata']
const OPEN_FORMS = ['/oauth/token', '/oauth/revoke']
function foreignForm(event: Pick<RequestEvent, 'request' | 'url' | 'route'>) {
  const { request } = event
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || OPEN_FORMS.includes(event.route.id ?? '')) return false
  const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
  return FORM_TYPES.includes(type) && request.headers.get('origin') !== event.url.origin
}

// The forms that send pictures: a sighting's own and those of its chain.
const PICTURE_FORMS = new Set(['/[locale]/batch', '/[locale]/new', '/[locale]/entry/[id]/sighting/new', '/[locale]/entry/[id]/sighting/[sighting]/edit'])

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  // A session cookie is only set over HTTPS, and every other origin than loopback is refused by `secureOrigin`,
  // so a plain-http request would end in a 500. Authenticated MCP requests must not redirect, since clients drop
  // Authorization across schemes and would fall through to the anonymous session; other requests go to HTTPS.
  if (event.url.protocol === 'http:' && !loopback(event.url)) {
    if ((event.route.id === '/mcp' || pathname === '/mcp') && event.request.headers.has('authorization')) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'HTTPS is required for authenticated MCP requests' } }), {
        status: 426,
        headers: { 'content-type': 'application/json', upgrade: 'TLS/1.2' },
      })
    }
    const secure = new URL(event.url)
    secure.protocol = 'https:'
    redirect(308, secure.href)
  }
  if (foreignForm(event)) return new Response(`Cross-site ${event.request.method} form submissions are forbidden`, { status: 403 })
  const first = pathname.split('/')[1]
  if (!isLocale(first) && !UNPREFIXED.test(pathname) && event.route.id !== '/[short=shortRecord]') {
    const locale = negotiate(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'))
    redirect(302, `/${locale}${pathname === '/' ? '' : pathname}${search}`)
  }
  const theme = event.cookies.get('ug.theme')
  event.locals.theme = theme === 'light' || theme === 'dark' ? theme : 'system'
  event.locals.glyphStyle = glyphStyleOf(event.cookies.get(GLYPH_STYLE_COOKIE))
  event.locals.tileSize = tileSizeOf(event.cookies.get(TILE_SIZE_COOKIE))
  const db = event.platform?.env.DB
  // A browser names itself by its cookie. An agent names itself by the token it signed in for, or else by
  // its connection's own.
  const agent = event.route.id === '/mcp'
  // A request that claims a token is that token's person or no one, never its connection's.
  const claims = agent && event.request.headers.has('authorization')
  event.locals.person = !db || pathname.startsWith('/media/') ? null : claims ? await tokenPerson(db, bearerOf(event.request)) : await personOf(db, agent ? agentToken(event.request) : event.cookies.get(sessionName(event)))
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && !(event.route.id === '/auth/sign-out' && event.request.method === 'POST')) {
    // An agent's request says in its body whether it writes, so the endpoint guards each writing tool itself.
    if (!agent) {
      const limit = writeLimitFor(event)
      if (!limit) return new Response('Not Found', { status: 404 })
      await guardWrite(event, limit, moderationAction(event))
    }
    const request = await limitWriteBody(event.request, agent || event.route.id?.startsWith('/oauth/') ? MAX_AGENT_BODY : PICTURE_FORMS.has(event.route.id ?? '') ? MAX_PICTURES_BODY : undefined)
    if (!request) return new Response('Payload Too Large', { status: 413 })
    event.request = request
  }
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', isLocale(first) ? first : 'en').replace('%theme%', event.locals.theme).replace('%tile%', String(event.locals.tileSize)),
  })
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('x-frame-options', 'SAMEORIGIN')
  return response
}
