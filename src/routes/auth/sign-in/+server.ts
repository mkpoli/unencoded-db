import { error, redirect } from '@sveltejs/kit'
import { challenge, config, cookiesFor, flowSettings, random, requireOrigin, sessionHash } from '$lib/server/auth'
import { hashToken } from '$lib/server/attribution'
import { discover } from '$lib/server/oidc'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async event => {
  requireOrigin(event)
  const { session, flow } = cookiesFor(event.url)
  const cfg = config(event)
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-in unavailable')
  const oldHash = await sessionHash(event.cookies.get(session.name))
  if (!oldHash) error(409, 'A contributor session is required to sign in')
  const row = await db.prepare(`SELECT person_id FROM contributor_sessions s WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? AND NOT EXISTS (SELECT 1 FROM revoked_session_families r WHERE r.family_hash = COALESCE(s.family_hash, s.token_hash))`).bind(oldHash, new Date().toISOString()).first<{ person_id: string }>()
  if (!row) error(409, 'Session expired; clear your cookie and try again')
  const person = row.person_id
  let provider
  try { provider = await discover(cfg.issuer) } catch { error(502, 'Sign-in unavailable') }
  const state = random(), verifier = random(), nonce = random()
  const expires = new Date(Date.now() + 600_000).toISOString()
  await db.prepare('INSERT INTO oidc_flows (state_hash, verifier, nonce, session_hash, person_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await hashToken(state), verifier, nonce, oldHash, person, expires).run()
  event.cookies.set(flow, state, { ...flowSettings, secure: session.secure })
  const target = new URL(provider.authorization_endpoint)
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: cfg.clientId, redirect_uri: `${cfg.publicOrigin}/auth/callback`, scope: 'openid profile', state, nonce, code_challenge: await challenge(verifier), code_challenge_method: 'S256' })) target.searchParams.append(key, value)
  redirect(303, target.href)
}
