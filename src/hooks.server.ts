import { limitWriteBody } from '$lib/server/body-limit'
import { authenticateModerator } from '$lib/server/cf-access'
import type { Handle } from '@sveltejs/kit'

// SvelteKit decodes the route pathname before matching, so the guard must do
// the same or an encoded request could reach a moderation route unverified.
export function isModerationPath(pathname: string): boolean {
  let decoded = pathname
  try {
    decoded = pathname.split('%25').map(decodeURI).join('%25')
  } catch {
    decoded = pathname
  }
  return [pathname, decoded].some(path => path === '/moderate' || path.startsWith('/moderate/'))
}

function withPageHeaders(response: Response, privatePage: boolean): Response {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/html') && !privatePage) return response
  const headers = new Headers(response.headers)
  if (type.includes('text/html')) {
    headers.set('x-frame-options', 'DENY')
    if (!headers.has('content-security-policy')) headers.set('content-security-policy', "frame-ancestors 'none'")
  }
  if (privatePage) headers.set('cache-control', 'private, no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.moderator = null

  const method = event.request.method
  // The resolved route id catches encodings the pathname check might miss.
  const guarded = isModerationPath(event.url.pathname) || isModerationPath(event.route?.id ?? '')
  if (guarded) {
    const email = await authenticateModerator(event.request, event.platform?.env)
    if (!email) return new Response(null, { status: 404, headers: { 'cache-control': 'private, no-store', 'x-frame-options': 'DENY' } })
    event.locals.moderator = email
  } else if (method === 'GET' && event.request.headers.has('cf-access-jwt-assertion')) {
    const email = await authenticateModerator(event.request, event.platform?.env)
    if (email) event.locals.moderator = email
  }

  if (method === 'POST') {
    const request = await limitWriteBody(event.request)
    if (!request) return new Response('Request too large', { status: 413 })
    event.request = request
  }
  const response = await resolve(event)
  return withPageHeaders(response, guarded || event.locals.moderator !== null)
}
