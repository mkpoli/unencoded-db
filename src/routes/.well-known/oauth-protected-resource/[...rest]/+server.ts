// What a client reads to learn who signs agents in for /mcp (RFC 9728). It is served at the bare
// well-known path and at the one that carries the endpoint's path, since clients ask for either.
import { error, json } from '@sveltejs/kit'
import { resourceOf } from '$lib/server/agents'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = (event) => {
  if (!['', 'mcp'].includes(event.params.rest)) error(404)
  return json({ resource: resourceOf(event), authorization_servers: [event.url.origin], bearer_methods_supported: ['header'] })
}
