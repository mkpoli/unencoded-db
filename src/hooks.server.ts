import { redirect, type Handle } from '@sveltejs/kit'
import { isLocale, LOCALE_COOKIE, negotiate } from '$lib/i18n'
import { personOf, sessionName } from '$lib/server/people'
import { limitWriteBody, MAX_BATCH_BODY } from '$lib/server/body-limit'
import { guardWrite, writeLimitFor } from '$lib/server/guard'

const UNPREFIXED = /^\/(media|api|auth|_app|robots\.txt|favicon)/

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url
  const first = pathname.split('/')[1]
  if (!isLocale(first) && !UNPREFIXED.test(pathname)) {
    const locale = negotiate(event.cookies.get(LOCALE_COOKIE), event.request.headers.get('accept-language'))
    redirect(302, `/${locale}${pathname === '/' ? '' : pathname}${search}`)
  }
  const theme = event.cookies.get('ug.theme')
  event.locals.theme = theme === 'light' || theme === 'dark' ? theme : 'system'
  const db = event.platform?.env.DB
  event.locals.person = db && !pathname.startsWith('/media/') ? await personOf(db, event.cookies.get(sessionName(event))) : null
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && !(event.route.id === '/auth/sign-out' && event.request.method === 'POST')) {
    const limit = writeLimitFor(event)
    if (!limit) return new Response('Not Found', { status: 404 })
    await guardWrite(event, limit, event.route.id === '/[locale]/moderate')
    const request = await limitWriteBody(event.request, event.route.id === '/[locale]/batch' ? MAX_BATCH_BODY : undefined)
    if (!request) return new Response('Payload Too Large', { status: 413 })
    event.request = request
  }
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', isLocale(first) ? first : 'en').replace('%theme%', event.locals.theme),
  })
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('x-frame-options', 'SAMEORIGIN')
  return response
}
