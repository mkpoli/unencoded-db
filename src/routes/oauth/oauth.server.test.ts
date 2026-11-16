import { expect, test } from 'bun:test'
import { handle } from '../../hooks.server'
import { challenge, nextPage, parseFlow, random } from '$lib/server/atlas'
import { CLIENT_LIFE, CODE_LIFE, TOKEN_LIFE } from '$lib/server/agents'
import { openTestDb } from '$lib/server/testdb'
import { GET as resourceMetadata } from '../.well-known/oauth-protected-resource/[...rest]/+server'
import { GET as serverMetadata } from '../.well-known/oauth-authorization-server/+server'
import { actions as consentActions, load as consentLoad } from '../[locale]/oauth/authorize/+page.server'
import { POST as mcp } from '../mcp/+server'
import { POST as register } from './register/+server'
import { POST as revoke } from './revoke/+server'
import { POST as token } from './token/+server'

const ORIGIN = 'https://example.test'
const CONSENT = '/[locale]/oauth/authorize'
const routes: Record<string, (event: any) => unknown> = {
  '/mcp': mcp, '/oauth/register': register, '/oauth/token': token, '/oauth/revoke': revoke,
  [CONSENT]: async event => event.request.method === 'POST' ? consentActions.default(event) : Response.json(await consentLoad(event)),
}

// A site with one browser. Every request goes through the hook, as it does on the Worker.
function fixture(bindings: Record<string, unknown> = {}) {
  const { db, raw } = openTestDb()
  const jar = new Map<string, string>()
  const cookies = { get: (name: string) => jar.get(name), set: (name: string, value: string) => { jar.set(name, value) }, delete: (name: string) => { jar.delete(name) } }
  const send = (route: string, path: string, init: RequestInit = {}) => {
    const request = new Request(`${ORIGIN}${path}`, init)
    const event = { request, url: new URL(request.url), route: { id: route }, params: { locale: 'en' }, locals: {}, cookies, platform: { env: { DB: db, ...bindings } }, getClientAddress: () => '127.0.0.1' }
    return handle({ event, resolve: (resolved: any) => routes[route](resolved) } as any) as Promise<any>
  }
  const json = (route: string, path: string, body: unknown, headers: Record<string, string> = {}) => send(route, path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  // A form as a client outside a browser posts it: no origin.
  const form = (route: string, path: string, fields: Record<string, string>, headers: Record<string, string> = {}) => send(route, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields) })
  const count = (table: string) => (raw.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

  const redirect = 'http://localhost:33418/callback'
  const client = async (redirect_uris = [redirect], client_name: string | undefined = 'Test Agent') => await (await json('/oauth/register', '/oauth/register', { redirect_uris, client_name })).json() as { client_id: string }
  const consent = (id: string, verifier: string, more: Record<string, string> = {}) => challenge(verifier).then(code_challenge => `/en/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: redirect, code_challenge, code_challenge_method: 'S256', state: 'xyz', ...more })}`)
  // The browser presses a button of the consent page, and the client is sent back.
  const decide = async (page: string, decision: 'allow' | 'deny') => {
    try { await form(CONSENT, page, { decision }, { origin: ORIGIN }) } catch (thrown: any) { return new URL(thrown.location) }
    throw new Error('The consent page sent no one back')
  }
  const trade = (fields: Record<string, string>) => form('/oauth/token', '/oauth/token', { grant_type: 'authorization_code', redirect_uri: redirect, ...fields })
  // The whole sign-in, to the token.
  const signIn = async () => {
    const { client_id } = await client(), code_verifier = random()
    const back = await decide(await consent(client_id, code_verifier), 'allow')
    const answer = await (await trade({ client_id, code_verifier, code: back.searchParams.get('code')! })).json() as { access_token: string }
    return answer.access_token
  }
  const call = (name: string, args: unknown, headers: Record<string, string> = {}) => json('/mcp', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers)
  return { db, raw, jar, send, json, form, count, redirect, client, consent, decide, trade, signIn, call }
}

const record = (ids: string) => ({ ids: [ids], sightings: [{ place: 'A sign', url: 'https://example.test/sign' }] })

test('a client finds where to sign in', async () => {
  const at = (path: string, rest = '') => ({ url: new URL(`${ORIGIN}${path}`), params: { rest } }) as any
  const resource = { resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN], bearer_methods_supported: ['header'] }
  expect(await (resourceMetadata(at('/.well-known/oauth-protected-resource')) as Response).json()).toEqual(resource)
  expect(await (resourceMetadata(at('/.well-known/oauth-protected-resource/mcp', 'mcp')) as Response).json()).toEqual(resource)
  expect(() => resourceMetadata(at('/.well-known/oauth-protected-resource/other', 'other'))).toThrow()
  expect(await (serverMetadata(at('/.well-known/oauth-authorization-server')) as Response).json()).toMatchObject({
    issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/oauth/authorize`, token_endpoint: `${ORIGIN}/oauth/token`, registration_endpoint: `${ORIGIN}/oauth/register`,
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
  })
})

test('an agent signs in and writes as the person who allowed it', async () => {
  const { raw, jar, send, client, consent, decide, trade, call, count, redirect } = fixture()
  const registered = await client() as any
  expect(registered).toMatchObject({ client_name: 'Test Agent', redirect_uris: [redirect], token_endpoint_auth_method: 'none' })
  const verifier = random(), page = await consent(registered.client_id, verifier)
  expect(await (await send(CONSENT, page)).json()).toEqual({ client: 'Test Agent', to: 'localhost:33418', next: page })
  // Nothing is kept for looking at the page.
  expect(count('people')).toBe(0)

  const back = await decide(page, 'allow')
  expect(`${back.origin}${back.pathname}`).toBe(redirect)
  expect(back.searchParams.get('state')).toBe('xyz')
  // The browser had saved nothing, so allowing is its first save: it becomes a person and keeps the cookie.
  const person = raw.query('SELECT id FROM people').get() as { id: string }
  expect(jar.size).toBe(1)

  const answer = await trade({ client_id: registered.client_id, code_verifier: verifier, code: back.searchParams.get('code')! })
  expect(answer.status).toBe(200)
  expect(answer.headers.get('cache-control')).toBe('no-store')
  const { access_token, token_type, expires_in } = await answer.json()
  expect({ token_type, expires_in }).toEqual({ token_type: 'Bearer', expires_in: TOKEN_LIFE / 1000 })
  expect(access_token).toMatch(/^[0-9a-f]{64}$/)
  expect(raw.query('SELECT count(*) AS n FROM agent_tokens WHERE token_hash = ?').get(access_token)).toEqual({ n: 0 })

  // The token names the person on /mcp, whatever connection id comes with it.
  expect((await (await call('add_record', record('⿰山東'), { authorization: `Bearer ${access_token}`, 'mcp-session-id': 'a'.repeat(64) })).json()).result.isError).toBeUndefined()
  expect(raw.query('SELECT created_by FROM entries').get()).toEqual({ created_by: person.id })
  expect(count('people')).toBe(1)
  expect(count('sessions')).toBe(1)
})

test('a token that names no one is refused, and a caller without one stays anonymous', async () => {
  const { form, call, signIn, count } = fixture()
  const access = await signIn()
  for (const authorization of ['Bearer nothing', `Bearer ${'0'.repeat(64)}`, `Basic ${access}`]) {
    const refused = await call('add_record', record('⿰山東'), { authorization })
    expect(refused.status).toBe(401)
    expect(refused.headers.get('www-authenticate')).toBe(`Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`)
  }
  expect(count('entries')).toBe(0)
  expect((await call('add_record', record('⿰山東'))).status).toBe(200)
  expect(count('entries')).toBe(1)
  expect(count('people')).toBe(2)

  // A token handed back names no one from then on.
  expect((await call('search_records', {}, { authorization: `Bearer ${access}` })).status).toBe(200)
  expect((await form('/oauth/revoke', '/oauth/revoke', { token: access })).status).toBe(200)
  expect((await call('search_records', {}, { authorization: `Bearer ${access}` })).status).toBe(401)
  expect(count('agent_tokens')).toBe(0)
})

test('a code is good once, for its own client, address and verifier, for ten minutes', async () => {
  const { raw, client, consent, decide, trade, count } = fixture()
  const { client_id } = await client(), other = await client()
  const granted = async () => { const code_verifier = random(); return { code_verifier, code: (await decide(await consent(client_id, code_verifier), 'allow')).searchParams.get('code')! } }
  const refused = async (fields: Record<string, string>) => { const answer = await trade(fields); expect(answer.status).toBe(400); return (await answer.json()).error }

  let grant = await granted()
  expect(await refused({ client_id, code: grant.code, code_verifier: random() })).toBe('invalid_grant')
  // A failed try spends the code.
  expect(await refused({ client_id, ...grant })).toBe('invalid_grant')
  grant = await granted()
  expect(await refused({ client_id: other.client_id, ...grant })).toBe('invalid_grant')
  grant = await granted()
  expect(await refused({ client_id, ...grant, redirect_uri: 'http://localhost:33418/elsewhere' })).toBe('invalid_grant')
  grant = await granted()
  raw.exec(`UPDATE agent_codes SET created_at = '${new Date(Date.now() - CODE_LIFE - 1000).toISOString()}'`)
  expect(await refused({ client_id, ...grant })).toBe('invalid_grant')
  grant = await granted()
  expect(await refused({ client_id, ...grant, grant_type: 'refresh_token' })).toBe('unsupported_grant_type')
  expect((await trade({ client_id, ...grant })).status).toBe(200)
  expect(await refused({ client_id, ...grant })).toBe('invalid_grant')
  expect(count('agent_codes')).toBe(0)
  expect(count('agent_tokens')).toBe(1)
})

test('the consent page sends a browser on only when a button is pressed', async () => {
  const { send, form, client, consent, decide, count } = fixture()
  const { client_id } = await client(), verifier = random()
  const page = await consent(client_id, verifier)
  // What a request that cannot be served is answered with: an error on this site, and no address to go to.
  const opened = (path: string) => send(CONSENT, path).then(() => 'shown', (thrown: any) => { expect(thrown.location).toBeUndefined(); expect(thrown.status).toBe(400); return thrown.body.message })
  expect(await opened(page)).toBe('shown')
  // A native app picks its loopback port when it starts.
  expect(await opened(page.replace('33418', '50000'))).toBe('shown')
  expect(await opened(await consent(crypto.randomUUID(), verifier))).toBe('invalid_client')
  expect(await opened(await consent(client_id, verifier, { redirect_uri: 'https://evil.example/callback' }))).toBe('invalid_client')
  expect(await opened(await consent(client_id, verifier, { redirect_uri: 'http://localhost:33418/other' }))).toBe('invalid_client')
  expect(await opened(await consent(client_id, verifier, { response_type: 'token' }))).toBe('unsupported_response_type')
  expect(await opened(await consent(client_id, verifier, { code_challenge_method: 'plain' }))).toBe('invalid_request')
  expect(await opened(await consent(client_id, verifier, { code_challenge: 'short' }))).toBe('invalid_request')
  expect(await opened(await consent(client_id, verifier, { state: 'x'.repeat(501) }))).toBe('invalid_request')
  expect(await opened(await consent(client_id, verifier, { resource: 'https://other.example/mcp' }))).toBe('invalid_target')
  expect(await opened(await consent(client_id, verifier, { resource: `${ORIGIN}/mcp` }))).toBe('shown')
  // Pressing a button on a request that cannot be served goes nowhere either.
  await expect(form(CONSENT, await consent(client_id, verifier, { response_type: 'token' }), { decision: 'allow' }, { origin: ORIGIN })).rejects.toMatchObject({ status: 400 })

  const back = await decide(page, 'deny')
  expect(Object.fromEntries(back.searchParams)).toEqual({ error: 'access_denied', state: 'xyz' })
  // Declining a client that is an app opens no app.
  const app = 'someapp://oauth/callback', registered = await client([app])
  const appPage = await consent(registered.client_id, verifier, { redirect_uri: app })
  expect((await (await send(CONSENT, appPage)).json()).to).toBe('someapp:')
  await expect(form(CONSENT, appPage, { decision: 'deny' }, { origin: ORIGIN })).rejects.toMatchObject({ status: 303, location: '/en' })
  await expect(form(CONSENT, appPage, { decision: 'allow' }, { origin: ORIGIN })).rejects.toMatchObject({ status: 303, location: expect.stringMatching(/^someapp:\/\/oauth\/callback\?code=[0-9a-f]{64}&state=xyz$/) })
  expect(count('agent_codes')).toBe(1)
})

test('a client registers only addresses a person can safely be sent to', async () => {
  const { raw, json, client, count, signIn } = fixture()
  const refused = async (redirect_uris: unknown) => { const answer = await json('/oauth/register', '/oauth/register', { redirect_uris }); expect(answer.status).toBe(400); return (await answer.json()).error }
  for (const uris of [undefined, [], ['http://example.org/callback'], ['javascript:alert(1)'], ['data:text/html,x'], ['https://example.org/callback#fragment'], ['https://user:pw@example.org/callback'], ['not an address'], Array(11).fill('https://example.org/callback'), ['https://example.org/ok', 'http://example.org/no']]) {
    expect(await refused(uris)).toBe('invalid_redirect_uri')
  }
  expect(count('agent_clients')).toBe(0)
  for (const uri of ['https://example.org/callback', 'http://127.0.0.1:8080/cb', 'http://[::1]/cb', 'cursor://anysphere.cursor-mcp/oauth/callback']) expect((await client([uri]) as any).redirect_uris).toEqual([uri])
  expect((await client(['https://example.org/callback'], 'A\u0000 long\n\tname ' + 'x'.repeat(200)) as any).client_name).toHaveLength(100)

  // A client no token names is forgotten a month on; one that signed someone in is kept.
  await signIn()
  raw.exec(`UPDATE agent_clients SET created_at = '${new Date(Date.now() - CLIENT_LIFE - 1000).toISOString()}'`)
  await client()
  expect(count('agent_clients')).toBe(2)
  expect(count('agent_tokens')).toBe(1)
})

test('a token follows its person into the account they sign in to, and stops at a ban or a year', async () => {
  const { raw, call, signIn } = fixture()
  const access = await signIn()
  const headers = { authorization: `Bearer ${access}` }
  raw.exec("INSERT INTO people(id, name, atlas_sub, created_at) VALUES('account', 'Atlas Name', 'sub', '2026-01-01T00:00:00.000Z'); UPDATE people SET merged_into = 'account' WHERE id != 'account'")
  await call('add_record', record('⿰山東'), headers)
  expect(raw.query('SELECT created_by FROM entries').get()).toEqual({ created_by: 'account' })
  raw.exec("UPDATE people SET banned_at = '2026-11-16T00:00:00.000Z' WHERE id = 'account'")
  expect((await (await call('add_record', record('⿰山西'), headers)).json()).result).toMatchObject({ isError: true })
  raw.exec(`UPDATE people SET banned_at = NULL; UPDATE agent_tokens SET created_at = '${new Date(Date.now() - TOKEN_LIFE - 1000).toISOString()}'`)
  expect((await call('add_record', record('⿰山西'), headers)).status).toBe(401)
})

test('a form is taken only from this site, and the token endpoints from anywhere', async () => {
  const { send, form, client, consent, count } = fixture()
  const posted = (route: string, path: string, headers: Record<string, string>) => send(route, path, { method: 'POST', headers, body: 'decision=allow' }).then((answer: any) => answer.status, (thrown: any) => thrown.status)
  const page = await consent((await client()).client_id, random())
  for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain', 'Application/X-WWW-Form-Urlencoded']) {
    expect(await posted(CONSENT, page, { 'content-type': type, origin: 'https://evil.example' })).toBe(403)
    expect(await posted(CONSENT, page, { 'content-type': type })).toBe(403)
  }
  expect(count('agent_codes')).toBe(0)
  expect(await posted(CONSENT, page, { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN })).toBe(303)
  expect(count('agent_codes')).toBe(1)
  expect((await form('/oauth/token', '/oauth/token', { grant_type: 'authorization_code' }, { origin: 'https://evil.example' })).status).toBe(400)
  expect((await form('/oauth/revoke', '/oauth/revoke', { token: 'none' })).status).toBe(200)
})

test('sign-in returns only to the consent page it was started from', () => {
  const page = '/ja/oauth/authorize?client_id=abc&state=x%20y'
  expect(nextPage(page)).toBe(page)
  for (const elsewhere of ['/ja/me', '//evil.example/oauth/authorize?x', 'https://evil.example/ja/oauth/authorize?x', '/xx/oauth/authorize?x', '/ja/oauth/authorize', '/ja/oauth/authorize?a b', `/ja/oauth/authorize?${'x'.repeat(1500)}`, null, 7]) expect(nextPage(elsewhere)).toBeUndefined()
  const flow = { state: random(), verifier: random(), nonce: random(), binding: 'a'.repeat(64), locale: 'ja', at: Date.now() }
  expect(parseFlow(JSON.stringify({ ...flow, next: page }))).toMatchObject({ next: page })
  expect(parseFlow(JSON.stringify({ ...flow, next: 'https://evil.example/' }))).toBeNull()
  expect(parseFlow(JSON.stringify(flow))).toMatchObject({ locale: 'ja' })
})
