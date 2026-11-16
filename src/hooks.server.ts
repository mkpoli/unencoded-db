import { GLYPH_STYLE_COOKIE, glyphStyleOf } from '$lib/composer'
import { redirect, type Handle } from '@sveltejs/kit'
import { isLocale, LOCALE_COOKIE, negotiate } from '$lib/i18n'
import { agentToken, personOf, sessionName } from '$lib/server/people'
import { limitWriteBody, MAX_AGENT_BODY, MAX_PICTURES_BODY } from '$lib/server/body-limit'
import { guardWrite, writeLimitFor } from '$lib/server/guard'
import { TILE_SIZE_COOKIE, tileSizeOf } from '$lib/tile-size'

const UNPREFIXED = /^\/(media|api|auth|mcp|_app|robots\.txt|favicon)/

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const first = pathname.split('/')[1]
  if (!isLocale(first) && !UNPREFIXED.test(pathname)) {
    const locale = negotiate(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'))
    redirect(302, `/${locale}${pathname === '/' ? '' : pathname}${search}`)
  }
  const theme = event.cookies.get('ug.theme')
  event.locals.theme = theme === 'light' || theme === 'dark' ? theme : 'system'
  event.locals.glyphStyle = glyphStyleOf(event.cookies.get(GLYPH_STYLE_COOKIE))
  event.locals.tileSize = tileSizeOf(event.cookies.get(TILE_SIZE_COOKIE))
  const db = event.platform?.env.DB
  // An agent names itself by its connection's token, a browser by its cookie.
  const agent = event.route.id === '/mcp'
  event.locals.person = db && !pathname.startsWith('/media/') ? await personOf(db, agent ? agentToken(event.request) : event.cookies.get(sessionName(event))) : null
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && !(event.route.id === '/auth/sign-out' && event.request.method === 'POST')) {
    // An agent's request says in its body whether it writes, so the endpoint guards each writing tool itself.
    if (!agent) {
      const limit = writeLimitFor(event)
      if (!limit) return new Response('Not Found', { status: 404 })
      await guardWrite(event, limit, event.route.id === '/[locale]/moderate')
    }
    const request = await limitWriteBody(event.request, agent ? MAX_AGENT_BODY : event.route.id === '/[locale]/batch' || event.route.id === '/[locale]/new' ? MAX_PICTURES_BODY : undefined)
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
