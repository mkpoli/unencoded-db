// Dynamic client registration (RFC 7591). Any client may register; what it gets is an id and the
// addresses it may be sent back to, and no secret.
import { json } from '@sveltejs/kit'
import { registerClient } from '$lib/server/agents'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async (event) => {
  let metadata: unknown
  try { metadata = await event.request.json() } catch { metadata = null }
  const client = await registerClient(env(event).DB, metadata)
  if (!client) return json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris holds 1 to 10 https, loopback or app addresses' }, { status: 400 })
  return json({
    client_id: client.id, client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(client.name ? { client_name: client.name } : {}),
    redirect_uris: client.redirect_uris, grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none',
  }, { status: 201, headers: { 'cache-control': 'no-store' } })
}
