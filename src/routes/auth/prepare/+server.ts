import { error, redirect } from '@sveltejs/kit'
import { config, cookiesFor, random, requireOrigin, sessionHash } from '$lib/server/auth'
import { hashToken, sessionCookieSettings } from '$lib/server/attribution'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async event => {
  requireOrigin(event)
  const { session } = cookiesFor(event.url)
  config(event)
  const db = event.platform?.env.DB
  if (!db) error(503, 'Sign-in unavailable')
  const old = event.cookies.get(session.name)
  if (old && /^[a-f0-9]{64}$/.test(old)) {
    const hash = await sessionHash(old)
    const live = await db.prepare(`SELECT 1 AS active FROM contributor_sessions s WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND NOT EXISTS (SELECT 1 FROM revoked_session_families r WHERE r.family_hash = COALESCE(s.family_hash, s.token_hash))`).bind(hash, new Date().toISOString()).first()
    if (live) redirect(303, '/auth/continue')
  }
  const token = random(), person = crypto.randomUUID(), now = new Date()
  await db.batch([
    db.prepare('INSERT INTO persons (id, created_at) VALUES (?, ?)').bind(person, now.toISOString()),
    db.prepare('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await hashToken(token), person, now.toISOString(), new Date(now.getTime() + sessionCookieSettings.maxAge * 1000).toISOString()),
  ])
  event.cookies.set(session.name, token, { ...sessionCookieSettings, secure: session.secure })
  redirect(303, '/auth/continue')
}
