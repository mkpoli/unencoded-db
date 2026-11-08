import { cookieOptions, hashToken } from '$lib/server/attribution'
import { configured } from '$lib/server/auth'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ platform, url, cookies }) => {
  const env = platform?.env
  const enabled = configured(env, url)
  const cookie = cookieOptions(url)
  const token = cookie && cookies.get(cookie.name)
  let signedIn = false, hasSession = false
  if (env && token && /^[a-f0-9]{64}$/.test(token)) {
    const row = await env.DB.prepare(`SELECT i.person_id AS linked FROM contributor_sessions s
      LEFT JOIN atlas_identities i ON i.person_id = s.person_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM revoked_session_families r WHERE r.family_hash = COALESCE(s.family_hash, s.token_hash))`)
      .bind(await hashToken(token), new Date().toISOString()).first<{ linked: string | null }>()
    hasSession = Boolean(row)
    signedIn = Boolean(row?.linked)
  }
  return { signInEnabled: enabled, signedIn, hasSession }
}
