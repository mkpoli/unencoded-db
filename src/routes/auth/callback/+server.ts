import { error, redirect } from '@sveltejs/kit'
import { config, cookiesFor, random, sessionHash } from '$lib/server/auth'
import { hashToken, sessionCookieSettings } from '$lib/server/attribution'
import { discover, fetchJson, fetchProfile, verifyIdentity, type Profile } from '$lib/server/oidc'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const cfg = config(event)
  const { session, flow } = cookiesFor(event.url)
  const state = event.cookies.get(flow)
  const params = event.url.searchParams
  if (!state || !/^[a-f0-9]{64}$/.test(state) || params.getAll('state').length !== 1 || params.get('state') !== state || params.getAll('code').length !== 1 || params.has('error')) error(400, 'Invalid sign-in request')
  const code = params.get('code')!
  if (!code || code.length > 4096) error(400, 'Invalid sign-in request')
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-in unavailable')
  const hash = await hashToken(state)
  const row = await db.prepare('SELECT verifier, nonce, session_hash FROM oidc_flows WHERE state_hash = ? AND expires_at > ?').bind(hash, new Date().toISOString()).first<{ verifier: string; nonce: string; session_hash: string | null }>()
  if (!row || row.session_hash !== await sessionHash(event.cookies.get(session.name))) error(400, 'Invalid sign-in request')
  event.cookies.delete(flow, { path: '/', secure: session.secure })
  let identity: { issuer: string; subject: string }
  let profile: Profile = { name: null, picture: null }
  try {
    const provider = await discover(cfg.issuer)
    const tokens = await fetchJson(provider.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${btoa(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`)}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${cfg.publicOrigin}/auth/callback`, code_verifier: row.verifier }),
    }) as { id_token?: unknown; access_token?: unknown }
    if (typeof tokens.id_token !== 'string') throw new Error('Missing ID token')
    identity = await verifyIdentity(tokens.id_token, provider.jwks_uri, cfg, row.nonce)
    if (typeof tokens.access_token === 'string' && provider.userinfo_endpoint)
      profile = await fetchProfile(provider.userinfo_endpoint, tokens.access_token, cfg.issuer, identity.subject).catch(() => profile)
  } catch { error(502, 'Sign-in unavailable') }
  const token = random()
  const now = new Date()
  try {
    await db.prepare('INSERT INTO oidc_completions (state_hash, issuer, subject, new_hash, now, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(hash, identity.issuer, identity.subject, await hashToken(token), now.toISOString(), new Date(now.getTime() + sessionCookieSettings.maxAge * 1000).toISOString()).run()
  } catch { error(409, 'Sign-in could not be completed') }
  if (profile.name || profile.picture) {
    try {
      await db.prepare('UPDATE atlas_identities SET name = COALESCE(?, name), picture = COALESCE(?, picture) WHERE issuer = ? AND subject = ?')
        .bind(profile.name, profile.picture, identity.issuer, identity.subject).run()
    } catch { /* The profile is optional; the session is already complete. */ }
  }
  event.cookies.set(session.name, token, { ...sessionCookieSettings, secure: session.secure })
  redirect(303, '/')
}
