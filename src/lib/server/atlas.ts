import { createLocalJWKSet, jwtVerify } from 'jose'
import { error, type RequestEvent } from '@sveltejs/kit'
import { isLocale } from '$lib/i18n'
import { hashHex } from './image'
import { secureOrigin, sessionName } from './people'

export const FLOW_COOKIE = '__Host-ug.auth'
const encoder = new TextEncoder()
export const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)))
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const challenge = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
export const flowCookie = (event: RequestEvent) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: event.url.protocol === 'https:', maxAge: 600 })
export const flowName = (event: RequestEvent) => secureOrigin(event) ? FLOW_COOKIE : 'ug.auth'
export const sessionBinding = async (event: RequestEvent) => hashHex(event.cookies.get(sessionName(event)) ?? '')

export function config(event: RequestEvent) {
  const env = event.platform?.env
  if (!env?.ATLAS_ISSUER || !env.ATLAS_CLIENT_ID || !env.ATLAS_CLIENT_SECRET) error(503, 'Sign-in unavailable')
  const issuer = new URL(env.ATLAS_ISSUER)
  if ((issuer.protocol !== 'https:' && !(issuer.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(issuer.hostname))) || issuer.search || issuer.hash || issuer.username || issuer.password || issuer.href.endsWith('/')) error(500, 'Invalid issuer')
  return { issuer: issuer.href, clientId: env.ATLAS_CLIENT_ID, secret: env.ATLAS_CLIENT_SECRET }
}

type Metadata = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
export async function metadata(issuer: string): Promise<Metadata> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { redirect: 'error' })
  if (!response.ok) throw new Error('Discovery failed')
  const data = await response.json() as Metadata
  if (data.issuer !== issuer) throw new Error('Issuer mismatch')
  for (const endpoint of [data.authorization_endpoint, data.token_endpoint, data.jwks_uri]) {
    const url = new URL(endpoint)
    if (url.origin !== new URL(issuer).origin || url.username || url.password || url.hash) throw new Error('Invalid endpoint')
  }
  return data
}

export type Flow = { state: string; verifier: string; nonce: string; binding: string; locale: string; at: number }
export function parseFlow(value: string | undefined): Flow | null {
  try {
    const f = JSON.parse(value ?? '') as Flow
    if (!f || ![f.state, f.verifier, f.nonce, f.binding].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{43,64}$/.test(v)) || !isLocale(f.locale) || !Number.isFinite(f.at) || f.at > Date.now() || f.at <= Date.now() - 600_000) return null
    return f
  } catch { return null }
}

export async function identity(token: string, jwksUri: string, issuer: string, clientId: string, nonce: string) {
  const response = await fetch(jwksUri, { redirect: 'error' })
  if (!response.ok) throw new Error('Keys unavailable')
  const keys = createLocalJWKSet(await response.json() as Parameters<typeof createLocalJWKSet>[0])
  const { payload } = await jwtVerify(token, keys, { issuer, audience: clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'] })
  if (payload.nonce !== nonce || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 || typeof payload.iat !== 'number' || payload.iat > Math.floor(Date.now() / 1000) + 60 || (payload.azp !== undefined && payload.azp !== clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) throw new Error('Invalid identity')
  return { sub: payload.sub, name: typeof payload.name === 'string' ? payload.name : '' }
}
