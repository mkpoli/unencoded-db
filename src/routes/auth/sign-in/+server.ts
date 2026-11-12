import { error, redirect } from '@sveltejs/kit'
import { isLocale } from '$lib/i18n'
import { challenge, config, flowCookie, flowName, metadata, random, sessionBinding } from '$lib/server/atlas'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { issuer, clientId } = config(event)
  let provider
  try { provider = await metadata(issuer) } catch { error(502, 'Sign-in unavailable') }
  const locale = event.url.searchParams.get('locale')
  const flow = { state: random(), verifier: random(), nonce: random(), binding: await sessionBinding(event), locale: locale && isLocale(locale) ? locale : 'en', at: Date.now() }
  event.cookies.set(flowName(event), JSON.stringify(flow), flowCookie(event))
  const target = new URL(provider.authorization_endpoint)
  target.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: `${event.url.origin}/auth/callback`, scope: 'openid profile', state: flow.state, nonce: flow.nonce, code_challenge: await challenge(flow.verifier), code_challenge_method: 'S256' }).toString()
  redirect(303, target.href)
}
