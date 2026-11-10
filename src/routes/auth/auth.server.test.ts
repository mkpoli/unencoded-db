import { afterEach, expect, test } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { GET as signIn } from './sign-in/+server'
import { GET as callback } from './callback/+server'
import { POST as signOut } from './sign-out/+server'
import { createPerson, personOf, startSession, endSession, rotateSession, sessionName, SESSION_COOKIE } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { identity, parseFlow, random } from '$lib/server/atlas'
import { handle } from '../../hooks.server'

const originalFetch = globalThis.fetch
const issuer = 'https://atlas.test/api/auth'
const discovery = { issuer, authorization_endpoint: `${issuer}/oauth2/authorize`, token_endpoint: `${issuer}/oauth2/token`, jwks_uri: `${issuer}/jwks` }
afterEach(() => { globalThis.fetch = originalFetch })

test('sign-in verifies OIDC and rotates the anonymous session; sign-out revokes it', async () => {
  const { db, raw } = openTestDb()
  const person = await createPerson(db, null, 'Writer')
  const old = await startSession(db, person.id)
  const other = await startSession(db, person.id)
  const jar = new Map([[SESSION_COOKIE, old]])
  const cookies = { get: (k: string) => jar.get(k), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }
  const env = { DB: db, ATLAS_ISSUER: issuer, ATLAS_CLIENT_ID: 'client', ATLAS_CLIENT_SECRET: 'secret' }
  const event = (url: string) => ({ url: new URL(url), cookies, platform: { env }, locals: { person }, request: new Request(url, { method: 'POST', headers: { origin: 'https://db.test' } }) }) as any
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...await exportJWK(publicKey), kid: 'one', alg: 'RS256' }
  let nonce = ''
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('openid-configuration')) return Response.json(discovery)
    if (url === discovery.jwks_uri) return Response.json({ keys: [jwk] })
    if (url === discovery.token_endpoint) {
      expect(init?.headers).toMatchObject({ authorization: `Basic ${btoa('client:secret')}` })
      expect((init!.body as URLSearchParams).get('code_verifier')).toBeTruthy()
      return Response.json({ id_token: await new SignJWT({ nonce, name: 'Atlas Name' }).setProtectedHeader({ alg: 'RS256', kid: 'one' }).setIssuer(issuer).setAudience('client').setSubject('atlas-user').setIssuedAt().setExpirationTime('5m').sign(privateKey) })
    }
    throw new Error(`Unexpected URL ${url}`)
  }) as unknown as typeof fetch
  let target = ''
  try { await signIn(event('https://db.test/auth/sign-in?locale=ja')) } catch (e: any) { target = e.location }
  const auth = new URL(target)
  expect(auth.pathname).toBe('/api/auth/oauth2/authorize')
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256')
  nonce = auth.searchParams.get('nonce')!
  const state = auth.searchParams.get('state')!
  const cb = event(`https://db.test/auth/callback?state=${state}&code=good`)
  await expect(callback(cb)).rejects.toMatchObject({ status: 303, location: '/ja/me' })
  const token = jar.get(SESSION_COOKIE)!
  expect(token).not.toBe(old)
  expect(await personOf(db, old)).toBeNull()
  expect(await personOf(db, other)).toBeNull()
  expect(await personOf(db, token)).toMatchObject({ id: person.id, name: 'Writer', atlas: true })
  expect(raw.query('SELECT atlas_sub FROM people WHERE id=?').get(person.id)).toEqual({ atlas_sub: 'atlas-user' })
  await expect(signOut(event('https://db.test/auth/sign-out?locale=ja'))).rejects.toMatchObject({ status: 303, location: '/ja/me' })
  expect(await personOf(db, token)).toBeNull()
  expect(jar.has(SESSION_COOKIE)).toBe(false)
})

test('rejects invalid signed identities and expired authorization requests', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...await exportJWK(publicKey), kid: 'one', alg: 'RS256' }
  globalThis.fetch = (async () => Response.json({ keys: [jwk] })) as unknown as typeof fetch
  const token = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'one' }).setIssuer(issuer).setAudience('client').setSubject('sub').setIssuedAt().setExpirationTime('5m').sign(privateKey)
  await expect(identity(token, discovery.jwks_uri, issuer, 'client', 'nonce')).resolves.toMatchObject({ sub: 'sub' })
  await expect(identity(token, discovery.jwks_uri, issuer, 'client', 'wrong')).rejects.toThrow()
  await expect(identity(token, discovery.jwks_uri, issuer, 'other', 'nonce')).rejects.toThrow()
  await expect(identity(token, discovery.jwks_uri, 'https://evil.test', 'client', 'nonce')).rejects.toThrow()
  const invalid = async (claims: Record<string, unknown>, iat: number) => new SignJWT({ nonce: 'nonce', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'one' }).setIssuer(issuer).setAudience('client').setSubject('sub').setIssuedAt(iat).setExpirationTime('10m').sign(privateKey)
  await expect(identity(await invalid({ azp: 'other' }, Math.floor(Date.now() / 1000)), discovery.jwks_uri, issuer, 'client', 'nonce')).rejects.toThrow()
  await expect(identity(await invalid({}, Math.floor(Date.now() / 1000) + 3600), discovery.jwks_uri, issuer, 'client', 'nonce')).rejects.toThrow()
  const flow = { state: random(), verifier: random(), nonce: random(), binding: 'a'.repeat(64), locale: 'en', at: Date.now() - 600_001 }
  expect(parseFlow(JSON.stringify(flow))).toBeNull()
})

test('HTTPS ignores sibling-domain legacy cookies and binds the host session', async () => {
  const { db } = openTestDb()
  const genuine = await createPerson(db), attacker = await createPerson(db)
  const own = await startSession(db, genuine.id), tossed = await startSession(db, attacker.id)
  const jar = new Map([[SESSION_COOKIE, own], ['ug.session', tossed]])
  const url = new URL('https://db.test/auth/sign-out')
  const event = { url, cookies: { get: (k: string) => jar.get(k) }, route: { id: '/auth/sign-out' }, platform: { env: { DB: db } }, locals: {}, request: new Request(url, { method: 'GET' }) } as any
  await handle({ event, resolve: async () => new Response('ok') } as any)
  expect(event.locals.person.id).toBe(genuine.id)
  expect(sessionName({ url: new URL('http://localhost:5173') })).toBe('ug.session')
  expect(sessionName({ url: new URL('http://127.0.0.1:8798') })).toBe('ug.session')
  expect(() => sessionName({ url: new URL('http://gaiji.glyphatlas.org') })).toThrow('Insecure origin')
  expect(() => sessionName({ url: new URL('http://public.test') })).toThrow('Insecure origin')
  jar.delete(SESSION_COOKIE)
  await handle({ event, resolve: async () => new Response('ok') } as any)
  expect(event.locals.person).toBeNull()
})

test('account session rotation fails after sign-out', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db, 'sub')
  const token = await startSession(db, person.id)
  await endSession(db, token)
  await expect(rotateSession(db, token, person.id, person.id)).rejects.toThrow()
})

test('sign-out reaches the endpoint through the hook, including during write freeze', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db, 'sub')
  const token = await startSession(db, person.id)
  const jar = new Map([[SESSION_COOKIE, token]])
  const cookies = { get: (k: string) => jar.get(k), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }
  const url = new URL('https://db.test/auth/sign-out?locale=en')
  const event = { url, cookies, route: { id: '/auth/sign-out' }, platform: { env: { DB: db, WRITES_PAUSED: '1' } }, locals: {}, request: new Request(url, { method: 'POST', headers: { origin: url.origin } }) } as any
  const response = await handle({ event, resolve: async (e: any) => {
    try { await signOut(e) } catch (error: any) { return new Response(null, { status: error.status, headers: { location: error.location } }) }
    return new Response(null)
  } } as any)
  expect(response.status).toBe(303)
  expect(response.headers.get('location')).toBe('/en/me')
  expect(await personOf(db, token)).toBeNull()
})

test('rejects forged state and cross-origin sign-out', async () => {
  const { db } = openTestDb()
  const jar = new Map<string, string>()
  const cookies = { get: (k: string) => jar.get(k), set: (k: string, v: string) => jar.set(k, v), delete: (k: string) => jar.delete(k) }
  globalThis.fetch = (async () => Response.json(discovery)) as unknown as typeof fetch
  const event = { url: new URL('https://db.test/auth/sign-in'), cookies, platform: { env: { DB: db, ATLAS_ISSUER: issuer, ATLAS_CLIENT_ID: 'c', ATLAS_CLIENT_SECRET: 's' } }, locals: { person: null }, request: new Request('https://db.test', { method: 'POST', headers: { origin: 'https://evil.test' } }) } as any
  await expect(signIn(event)).rejects.toMatchObject({ status: 303 })
  event.url = new URL('https://db.test/auth/callback?code=x&state=wrong')
  await expect(callback(event)).rejects.toMatchObject({ status: 400 })
  await expect(signOut(event)).rejects.toMatchObject({ status: 403 })
})
