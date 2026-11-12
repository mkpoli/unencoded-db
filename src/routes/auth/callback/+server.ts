import { error, redirect } from '@sveltejs/kit'
import { config, flowCookie, flowName, identity, metadata, parseFlow, sessionBinding } from '$lib/server/atlas'
import { cleanName, joinAtlas, sessionName, sessionCookie, startSession, rotateSession, newSessionToken } from '$lib/server/people'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const name = flowName(event)
  const flow = parseFlow(event.cookies.get(name))
  event.cookies.delete(name, { path: '/', secure: flowCookie(event).secure })
  if (!flow || flow.state !== event.url.searchParams.get('state') || flow.binding !== await sessionBinding(event)) error(400, 'Invalid sign-in request')
  const code = event.url.searchParams.get('code')
  if (!code || event.url.searchParams.has('error')) error(400, 'Sign-in was not completed')
  const { issuer, clientId, secret } = config(event)
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-in unavailable')
  let claims: { sub: string; name: string }
  try {
    const provider = await metadata(issuer)
    const response = await fetch(provider.token_endpoint, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`)}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${event.url.origin}/auth/callback`, code_verifier: flow.verifier }),
    })
    if (!response.ok) throw new Error('Token exchange failed')
    const tokens = await response.json() as { id_token?: unknown }
    if (typeof tokens.id_token !== 'string') throw new Error('Missing identity token')
    claims = await identity(tokens.id_token, provider.jwks_uri, issuer, clientId, flow.nonce)
  } catch { error(502, 'Sign-in unavailable') }
  if (event.locals.person?.banned) error(403, 'banned')
  const old = event.cookies.get(sessionName(event))
  const replacement = event.locals.person && !event.locals.person.atlas ? newSessionToken() : undefined
  const id = await joinAtlas(db, event.locals.person, claims.sub, cleanName(claims.name) ?? 'Glyph Atlas', old, replacement)
  const token = replacement ?? (event.locals.person?.atlas
    ? await rotateSession(db, old!, event.locals.person.id, id)
    : await startSession(db, id))
  event.cookies.set(sessionName(event), token, { ...sessionCookie, secure: event.url.protocol === 'https:' })
  redirect(303, `/${flow.locale}/me`)
}
