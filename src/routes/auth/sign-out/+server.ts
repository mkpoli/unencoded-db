import { error, redirect } from '@sveltejs/kit'
import { cookiesFor, requireOrigin, sessionHash, validPublicOrigin } from '$lib/server/auth'
import { hashToken } from '$lib/server/attribution'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async event => {
  requireOrigin(event)
  if (!validPublicOrigin(event.platform?.env, event.url)) error(503, 'Sign-out unavailable')
  const { session, flow } = cookiesFor(event.url)
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-out unavailable')
  const token = event.cookies.get(session.name)
  const oldHash = token && /^[a-f0-9]{64}$/.test(token) ? await sessionHash(token) : null
  const state = event.cookies.get(flow)
  const flowHash = state && /^[a-f0-9]{64}$/.test(state) ? await hashToken(state) : null
  await db.batch([
    db.prepare('DELETE FROM oidc_flows WHERE state_hash = ?').bind(flowHash),
    db.prepare('INSERT OR IGNORE INTO revoked_session_families (family_hash, revoked_at) SELECT COALESCE(family_hash, token_hash), ? FROM contributor_sessions WHERE token_hash = ?').bind(new Date().toISOString(), oldHash),
    db.prepare('UPDATE contributor_sessions SET revoked_at = ? WHERE (token_hash = ? OR parent_hash = ?) AND revoked_at IS NULL').bind(new Date().toISOString(), oldHash, oldHash),
  ])
  event.cookies.delete(session.name, { path: '/', secure: session.secure })
  event.cookies.delete(flow, { path: '/', secure: session.secure })
  redirect(303, '/')
}
