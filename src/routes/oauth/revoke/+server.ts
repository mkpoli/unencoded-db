// Token revocation (RFC 7009): a client hands back the token it no longer wants.
import { revokeToken } from '$lib/server/agents'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async (event) => {
  let token: FormDataEntryValue | null = null
  try { token = (await event.request.formData()).get('token') } catch { /* an unreadable body names no token */ }
  await revokeToken(env(event).DB, typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? token : null)
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } })
}
