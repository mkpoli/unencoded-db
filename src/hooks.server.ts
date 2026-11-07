import { limitWriteBody, writeBodyLimit } from '$lib/server/body-limit'
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  if (event.request.method === 'POST') {
    const request = await limitWriteBody(event.request, writeBodyLimit(event.url.pathname))
    if (!request) return new Response('Request too large', { status: 413 })
    event.request = request
  }
  return resolve(event)
}
