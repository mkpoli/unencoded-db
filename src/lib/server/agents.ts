// Sign-in for agents: this site as an OAuth 2.1 authorization server for its own /mcp endpoint, as the
// Model Context Protocol's authorization section asks of a server that names its callers
// (https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization). A client registers
// itself (RFC 7591), sends the person's browser to the consent page with a PKCE challenge (RFC 7636),
// and trades the code it gets back for a bearer token. The token names the person who allowed it and
// nothing more: every client is public, there are no scopes, and an agent can do only what /mcp offers.
import type { RequestEvent } from '@sveltejs/kit'
import { challenge } from './atlas'
import { hashHex } from './image'
import type { Person } from './people'

export const CODE_LIFE = 10 * 60 * 1000
export const TOKEN_LIFE = 365 * 24 * 60 * 60 * 1000
/** A client that no token names is forgotten after this long. */
export const CLIENT_LIFE = 30 * 24 * 60 * 60 * 1000
export const REDIRECTS_MAX = 10
const URI_MAX = 500
const NAME_MAX = 100

const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('')
const ago = (life: number) => new Date(Date.now() - life).toISOString()
const now = () => new Date().toISOString()

/** The address of the endpoint the tokens are for, and of this site as their issuer. */
export const resourceOf = (event: Pick<RequestEvent, 'url'>) => `${event.url.origin}/mcp`
export const resourceMetadata = (event: Pick<RequestEvent, 'url'>) => `${event.url.origin}/.well-known/oauth-protected-resource/mcp`

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const UNSAFE_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'])

// Where a client may be sent back to: an https address, a loopback address of the person's own machine,
// or an app's own scheme (RFC 8252). No fragment, and nothing a browser would run. Anyone may register
// any such address, so a person is sent to one only by a button they press on the consent page, which
// names it.
function redirectUri(value: unknown): URL | null {
  if (typeof value !== 'string' || !value || value.length > URI_MAX) return null
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (url.hash || url.username || url.password || UNSAFE_SCHEMES.has(url.protocol)) return null
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname) ? url : null
  return url
}

// A registered address is matched whole. A loopback one is matched without its port, which a native
// app picks when it starts (RFC 8252, section 7.3).
function sameRedirect(registered: string, given: string) {
  if (registered === given) return true
  const a = redirectUri(registered), b = redirectUri(given)
  if (!a || !b || a.protocol !== 'http:' || b.protocol !== 'http:') return false
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search
}

export type AgentClient = { id: string; name: string | null; redirect_uris: string[] }

/** Registers a client from the metadata it sends, or answers null for metadata this site cannot serve. */
export async function registerClient(db: D1Database, metadata: unknown): Promise<AgentClient | null> {
  const given = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  const uris = given.redirect_uris
  if (!Array.isArray(uris) || !uris.length || uris.length > REDIRECTS_MAX || !uris.every(redirectUri)) return null
  const name = typeof given.client_name === 'string' ? given.client_name.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/gu, ' ').trim().slice(0, NAME_MAX) || null : null
  const client = { id: crypto.randomUUID(), name, redirect_uris: uris as string[] }
  await db.batch([
    db.prepare('DELETE FROM agent_clients WHERE id IN (SELECT c.id FROM agent_clients c WHERE c.created_at <= ? AND NOT EXISTS (SELECT 1 FROM agent_tokens t WHERE t.client = c.id) AND NOT EXISTS (SELECT 1 FROM agent_codes k WHERE k.client = c.id) ORDER BY c.created_at LIMIT 100)').bind(ago(CLIENT_LIFE)),
    db.prepare('INSERT INTO agent_clients(id, name, redirect_uris, created_at) VALUES(?,?,?,?)').bind(client.id, client.name, JSON.stringify(client.redirect_uris), now()),
  ])
  return client
}

export async function clientOf(db: D1Database, id: string | null): Promise<AgentClient | null> {
  if (!id || id.length > 100) return null
  const row = await db.prepare('SELECT id, name, redirect_uris FROM agent_clients WHERE id = ?').bind(id).first<{ id: string; name: string | null; redirect_uris: string }>()
  return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) as string[] } : null
}

export type AuthorizeRequest = { client: AgentClient; redirect: string; challenge: string; state: string | null }
export type AuthorizeError = 'invalid_client' | 'invalid_request' | 'unsupported_response_type' | 'invalid_target'

/**
 * What an address of the consent page asks for, or what is wrong with it. A request that is wrong is
 * shown as an error on this site and never sent on: registration is open, so sending it on would make
 * the page a redirect to anywhere.
 */
export async function readAuthorize(db: D1Database, event: Pick<RequestEvent, 'url'>): Promise<AuthorizeRequest | AuthorizeError> {
  const params = event.url.searchParams
  const client = await clientOf(db, params.get('client_id'))
  const redirect = params.get('redirect_uri')
  if (!client || !redirect || !client.redirect_uris.some(registered => sameRedirect(registered, redirect))) return 'invalid_client'
  const state = params.get('state')
  if ((state?.length ?? 0) > 500) return 'invalid_request'
  if (params.get('response_type') !== 'code') return 'unsupported_response_type'
  const stated = params.get('code_challenge')
  if (!stated || !/^[A-Za-z0-9_-]{43}$/.test(stated) || params.get('code_challenge_method') !== 'S256') return 'invalid_request'
  // A token is for this site's endpoint alone (RFC 8707).
  const resource = params.get('resource')
  if (resource && ![resourceOf(event), event.url.origin, `${event.url.origin}/`].includes(resource)) return 'invalid_target'
  return { client, redirect, challenge: stated, state }
}

/** Whether an address is one a browser opens as a page, and so one a person can be sent back to without having allowed anything. */
export const webAddress = (redirect: string) => /^https?:$/.test(new URL(redirect).protocol)

/** The address a client is sent back to, with what it is told. */
export function redirectBack(redirect: string, state: string | null, told: Record<string, string>) {
  const url = new URL(redirect)
  for (const [name, value] of Object.entries(told)) url.searchParams.set(name, value)
  if (state !== null) url.searchParams.set('state', state)
  return url.href
}

/** A code for a request the person allowed. It is good once, for ten minutes. */
export async function grantCode(db: D1Database, request: AuthorizeRequest, person: string) {
  const code = random()
  await db.batch([
    db.prepare('DELETE FROM agent_codes WHERE code_hash IN (SELECT code_hash FROM agent_codes WHERE created_at <= ? ORDER BY created_at LIMIT 100)').bind(ago(CODE_LIFE)),
    db.prepare('INSERT INTO agent_codes(code_hash, client, person, redirect_uri, challenge, created_at) VALUES(?,?,?,?,?,?)').bind(await hashHex(code), request.client.id, person, request.redirect, request.challenge, now()),
  ])
  return code
}

/** Trades a code for a token, or answers null when the code, its client, its address or its verifier is not the one granted. */
export async function redeemCode(db: D1Database, given: { code: string | null; client: string | null; redirect: string | null; verifier: string | null }) {
  if (!given.code || !given.client || !given.verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(given.verifier)) return null
  // The code is taken whether or not the rest matches, so it cannot be tried twice.
  const row = await db.prepare('DELETE FROM agent_codes WHERE code_hash = ? RETURNING client, person, redirect_uri, challenge, created_at').bind(await hashHex(given.code)).first<{ client: string; person: string; redirect_uri: string; challenge: string; created_at: string }>()
  if (!row || row.created_at <= ago(CODE_LIFE) || row.client !== given.client) return null
  if (given.redirect !== null && given.redirect !== row.redirect_uri) return null
  if (await challenge(given.verifier) !== row.challenge) return null
  const token = random()
  await db.batch([
    db.prepare('DELETE FROM agent_tokens WHERE token_hash IN (SELECT token_hash FROM agent_tokens WHERE created_at <= ? ORDER BY created_at LIMIT 100)').bind(ago(TOKEN_LIFE)),
    db.prepare('INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(?,?,?,?)').bind(await hashHex(token), row.client, row.person, now()),
  ])
  return token
}

export async function revokeToken(db: D1Database, token: string | null) {
  if (token) await db.prepare('DELETE FROM agent_tokens WHERE token_hash = ?').bind(await hashHex(token)).run()
}

/** The token a request carries as `Authorization: Bearer`, or undefined. */
export function bearerOf(request: Request) {
  const match = /^Bearer +([0-9a-f]{64})$/i.exec(request.headers.get('authorization') ?? '')
  return match ? match[1].toLowerCase() : undefined
}

/** The person a token names. One who has since signed in to an account is that account's person. */
export async function tokenPerson(db: D1Database, token: string | undefined): Promise<Person | null> {
  if (!token) return null
  const row = await db.prepare('SELECT e.id, e.name, e.atlas_sub, e.role, e.banned_at FROM agent_tokens t JOIN people p ON p.id = t.person JOIN people e ON e.id = COALESCE(p.merged_into, p.id) WHERE t.token_hash = ? AND t.created_at > ?')
    .bind(await hashHex(token), ago(TOKEN_LIFE)).first<{ id: string; name: string; atlas_sub: string | null; role: string; banned_at: string | null }>()
  return row ? { id: row.id, name: row.name, atlas: Boolean(row.atlas_sub), moderator: row.role === 'moderator', banned: Boolean(row.banned_at) } : null
}
