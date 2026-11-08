import { limitWriteBody, writeBodyLimit } from '$lib/server/body-limit'
import { localeFromPathname, t } from '$lib/i18n'
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  const locale = localeFromPathname(event.url.pathname) ?? 'en'
  if (event.request.method === 'POST') {
    const request = await limitWriteBody(event.request, writeBodyLimit(event.url.pathname))
    if (!request) return new Response(t(locale, 'error.tooLarge'), { status: 413, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    event.request = request
  }
  return resolve(event, { transformPageChunk: ({ html }) => html.replace(/<html lang="%lang%"/, `<html lang="${locale}"`) })
}
