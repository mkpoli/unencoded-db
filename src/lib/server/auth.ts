import { error, type RequestEvent } from '@sveltejs/kit'
import { cookieOptions, hashToken } from './attribution'
import { validateIssuer, type OidcConfig } from './oidc'

const encoder = new TextEncoder()
export const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
export const challenge = async (verifier: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const flowSettings = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 600 }

export function cookiesFor(url: URL) {
  const session = cookieOptions(url)
  if (!session) error(403, 'Secure connection required')
  return { session, flow: session.secure ? '__Host-atlas-flow' : 'atlas-flow-local' }
}
export function requireOrigin(event: RequestEvent) {
  if (event.request.headers.get('origin') !== event.url.origin) error(403, 'Invalid origin')
}
export function validPublicOrigin(env: App.Platform['env'] | undefined, url: URL) {
  if (!env?.ATLAS_PUBLIC_ORIGIN) return false
  try {
    const origin = new URL(env.ATLAS_PUBLIC_ORIGIN)
    return origin.origin === env.ATLAS_PUBLIC_ORIGIN && Boolean(cookieOptions(origin)) && origin.origin === url.origin
  } catch { return false }
}
export function configured(env: App.Platform['env'] | undefined, url: URL) {
  if (!env?.ATLAS_ISSUER || !env.ATLAS_CLIENT_ID || !env.ATLAS_CLIENT_SECRET || !validPublicOrigin(env, url)) return false
  try { validateIssuer(env.ATLAS_ISSUER); return true } catch { return false }
}
export function config(event: RequestEvent): OidcConfig & { publicOrigin: string } {
  const env = event.platform?.env
  if (!configured(env, event.url)) error(503, 'Sign-in unavailable')
  return { issuer: env!.ATLAS_ISSUER!, clientId: env!.ATLAS_CLIENT_ID!, clientSecret: env!.ATLAS_CLIENT_SECRET!, publicOrigin: env!.ATLAS_PUBLIC_ORIGIN! }
}
export async function sessionHash(token: string | undefined) {
  if (!token) return null
  if (!/^[a-f0-9]{64}$/.test(token)) error(400, 'Invalid session')
  return hashToken(token)
}
