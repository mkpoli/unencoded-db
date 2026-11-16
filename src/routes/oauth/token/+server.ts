// The token endpoint: a code and its PKCE verifier for a bearer token (RFC 6749, section 4.1.3).
import { json } from '@sveltejs/kit'
import { redeemCode, TOKEN_LIFE } from '$lib/server/agents'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

const refuse = (error: string) => json({ error }, { status: 400, headers: { 'cache-control': 'no-store' } })

export const POST: RequestHandler = async (event) => {
  let form: FormData
  try { form = await event.request.formData() } catch { return refuse('invalid_request') }
  const field = (name: string) => { const value = form.get(name); return typeof value === 'string' ? value : null }
  if (field('grant_type') !== 'authorization_code') return refuse('unsupported_grant_type')
  const token = await redeemCode(env(event).DB, { code: field('code'), client: field('client_id'), redirect: field('redirect_uri'), verifier: field('code_verifier') })
  if (!token) return refuse('invalid_grant')
  return json({ access_token: token, token_type: 'Bearer', expires_in: Math.floor(TOKEN_LIFE / 1000) }, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } })
}
