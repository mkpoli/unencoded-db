import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { POST as signIn } from './sign-in/+server'
import { POST as prepare } from './prepare/+server'
import { GET as callback } from './callback/+server'
import { POST as signOut } from './sign-out/+server'
import { hashToken } from '$lib/server/attribution'

const issuer = 'https://id.example'
const origin = 'https://app.example'
const oldFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = oldFetch })

async function setup() {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  for (const file of ['0001_init.sql', '0002_entry_visibility.sql', '0003_attribution.sql', '0004_oidc.sql']) sqlite.exec(readFileSync(new URL(`../../../migrations/${file}`, import.meta.url), 'utf8'))
  const db = {
    prepare(sql: string) { return { bind(...args: any[]) {
      const execute = () => sqlite.prepare(sql).all(...args)
      return { first: async () => execute()[0] ?? null, run: async () => ({ results: execute() }), execute }
    } } },
    batch: async (queries: { execute: () => unknown }[]) => sqlite.transaction(() => queries.map(q => q.execute()))(),
  }
  const jar = new Map<string, string>()
  const cookies = { get: (key: string) => jar.get(key), set: (key: string, value: string) => { jar.set(key, value) }, delete: (key: string) => { jar.delete(key) } }
  const event = (path: string, method = 'GET', requestOrigin = origin) => ({ url: new URL(path, origin), request: new Request(new URL(path, origin), { method, headers: { origin: requestOrigin } }), cookies, platform: { env: { DB: db, ATLAS_ISSUER: issuer, ATLAS_CLIENT_ID: 'client', ATLAS_CLIENT_SECRET: 'secret', ATLAS_PUBLIC_ORIGIN: origin } } }) as any
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = { ...await exportJWK(publicKey), kid: 'one' }
  let nonce = '', verifier = '', subject = 'alice'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize?provider=atlas`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys` })
    if (url.endsWith('/keys')) return Response.json({ keys: [jwk] })
    if (url.endsWith('/token')) {
      const now = Math.floor(Date.now() / 1000)
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('redirect_uri')).toBe(`${origin}/auth/callback`)
      const requestVerifier = params.get('code_verifier')
      const stored = sqlite.query('SELECT nonce FROM oidc_flows WHERE verifier = ?').get(requestVerifier) as { nonce: string } | null
      const id_token = await new SignJWT({ nonce: stored?.nonce ?? nonce }).setProtectedHeader({ alg: 'RS256', kid: 'one' }).setIssuer(issuer).setSubject(subject).setAudience('client').setIssuedAt(now).setExpirationTime(now + 300).sign(privateKey)
      return Response.json({ id_token })
    }
    throw new Error(`Unexpected URL ${url}`)
  }) as unknown as typeof fetch
  const start = async () => {
    if (!jar.has('__Host-contributor')) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
      const person = crypto.randomUUID()
      sqlite.query('INSERT INTO persons (id, created_at) VALUES (?, ?)').run(person, '2020')
      sqlite.query('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await hashToken(token), person, '2020', '2099')
      jar.set('__Host-contributor', token)
    }
    let location = ''
    try { await signIn(event('/auth/sign-in', 'POST')) } catch (e: any) { expect(e.status).toBe(303); location = e.location }
    const url = new URL(location)
    expect(url.searchParams.get('provider')).toBe('atlas')
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/auth/callback`)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    nonce = url.searchParams.get('nonce')!
    const state = url.searchParams.get('state')!
    verifier = (sqlite.query('SELECT verifier FROM oidc_flows WHERE state_hash = ?').get(await hashToken(state)) as any).verifier
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    expect(url.searchParams.get('code_challenge')).toBe(btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    return `/auth/callback?code=test&state=${state}`
  }
  return { sqlite, jar, event, start, setSubject: (value: string) => { subject = value } }
}

describe('OIDC routes', () => {
  test('authentication lookups use indexes', async () => {
    const s = await setup()
    try {
      const queries: [string, unknown[]][] = [
        ['SELECT person_id FROM contributor_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?', ['x', '2020']],
        ['SELECT verifier, nonce, session_hash FROM oidc_flows WHERE state_hash = ? AND expires_at > ?', ['x', '2020']],
        ['SELECT i.person_id FROM contributor_sessions s LEFT JOIN atlas_identities i ON i.person_id = s.person_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?', ['x', '2020']],
        ['UPDATE contributor_sessions SET revoked_at = ? WHERE (token_hash = ? OR parent_hash = ?) AND revoked_at IS NULL', ['2020', 'x', 'x']],
      ]
      for (const [sql, values] of queries) {
        const plan = s.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values as any[]) as { detail: string }[]
        expect(plan.some(row => /SEARCH/i.test(row.detail))).toBe(true)
        expect(plan.some(row => /\bSCAN\s+(?:s|i|contributor_sessions|atlas_identities|oidc_flows)\b|USE TEMP B-TREE/i.test(row.detail))).toBe(false)
      }
    } finally { s.sqlite.close() }
  })
  test('rejects an unconfigured or wrong public origin', async () => {
    const s = await setup()
    try {
      const wrong = s.event('/auth/prepare', 'POST', 'https://evil.example')
      wrong.url = new URL('https://evil.example/auth/prepare')
      await expect(prepare(wrong)).rejects.toMatchObject({ status: 503 })
      const missing = s.event('/auth/prepare', 'POST')
      delete missing.platform.env.ATLAS_PUBLIC_ORIGIN
      await expect(prepare(missing)).rejects.toMatchObject({ status: 503 })
      expect(s.jar.size).toBe(0)
    } finally { s.sqlite.close() }
  })
  test('sign-in requires an established session', async () => {
    const s = await setup()
    try {
      await expect(signIn(s.event('/auth/sign-in', 'POST'))).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM oidc_flows').get()).toEqual({ n: 0 })
      await expect(prepare(s.event('/auth/prepare', 'POST', 'https://evil.example'))).rejects.toMatchObject({ status: 403 })
      await expect(prepare(s.event('/auth/prepare', 'POST'))).rejects.toMatchObject({ status: 303 })
      expect(s.jar.get('__Host-contributor')).toMatch(/^[a-f0-9]{64}$/)
      const prepared = s.jar.get('__Host-contributor')
      await expect(prepare(s.event('/auth/prepare', 'POST'))).rejects.toMatchObject({ status: 303 })
      expect(s.jar.get('__Host-contributor')).toBe(prepared)
      await s.start()
    } finally { s.sqlite.close() }
  })
  test('signout fences a paused callback even when another flow replaces its cookie', async () => {
    const s = await setup()
    try {
      const first = await s.start()
      let release!: () => void, reached!: () => void
      const blocked = new Promise<void>(resolve => { release = resolve })
      const waiting = new Promise<void>(resolve => { reached = resolve })
      const provider = globalThis.fetch
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith('/token')) { reached(); await blocked }
        return provider(input, init)
      }) as unknown as typeof fetch
      const pending = callback(s.event(first))
      await waiting
      await s.start()
      await expect(signOut(s.event('/auth/sign-out', 'POST'))).rejects.toMatchObject({ status: 303 })
      release()
      await expect(pending).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM atlas_identities').get()).toEqual({ n: 0 })
    } finally { s.sqlite.close() }
  })
  test('mock provider signs in, rotates session, and signout revokes it', async () => {
    const s = await setup()
    try {
      const path = await s.start()
      const flow = s.jar.get('__Host-atlas-flow')
      await expect(callback(s.event('/auth/callback?state=bad&code=bad'))).rejects.toMatchObject({ status: 400 })
      expect(s.jar.get('__Host-atlas-flow')).toBe(flow)
      await expect(callback(s.event(path))).rejects.toMatchObject({ status: 303, location: '/' })
      const token = s.jar.get('__Host-contributor')!
      expect(token).toMatch(/^[a-f0-9]{64}$/)
      expect(s.sqlite.query('SELECT issuer, subject FROM atlas_identities').get()).toEqual({ issuer, subject: 'alice' })
      await expect(callback(s.event(path))).rejects.toMatchObject({ status: 400 })
      await expect(signOut(s.event('/auth/sign-out', 'POST'))).rejects.toMatchObject({ status: 303 })
      expect((s.sqlite.query('SELECT revoked_at FROM contributor_sessions WHERE token_hash = ?').get(await hashToken(token)) as any).revoked_at).toBeTruthy()
    } finally { s.sqlite.close() }
  })
  test('rejects CSRF and a callback after session revocation', async () => {
    const s = await setup()
    try {
      await expect(signIn(s.event('/auth/sign-in', 'POST', 'https://evil.example'))).rejects.toMatchObject({ status: 403 })
      s.sqlite.exec("INSERT INTO persons VALUES ('p', '2020'); INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES ('old', 'p', '2020', '2099')")
      const token = 'a'.repeat(64)
      s.sqlite.query('UPDATE contributor_sessions SET token_hash = ?').run(await hashToken(token))
      s.jar.set('__Host-contributor', token)
      const path = await s.start()
      s.sqlite.exec("UPDATE contributor_sessions SET revoked_at = '2020'")
      await expect(callback(s.event(path))).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM atlas_identities').get()).toEqual({ n: 0 })
    } finally { s.sqlite.close() }
  })
  test('merges anonymous attribution without rewriting historical creator ids', async () => {
    const s = await setup()
    try {
      await expect(callback(s.event(await s.start()))).rejects.toMatchObject({ status: 303 })
      const atlasPerson = (s.sqlite.query('SELECT person_id FROM atlas_identities').get() as any).person_id
      await expect(signOut(s.event('/auth/sign-out', 'POST'))).rejects.toMatchObject({ status: 303 })
      const token = 'b'.repeat(64)
      s.sqlite.exec("INSERT INTO persons VALUES ('anonymous', '2020'); INSERT INTO entries (script, place, url, created_at, creator_id) VALUES ('Han', 'place', 'https://example.org', '2020', 'anonymous')")
      s.sqlite.query('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await hashToken(token), 'anonymous', '2020', '2099')
      s.jar.set('__Host-contributor', token)
      await expect(callback(s.event(await s.start()))).rejects.toMatchObject({ status: 303 })
      expect(s.sqlite.query('SELECT source_id, target_id FROM person_merges').get()).toEqual({ source_id: 'anonymous', target_id: atlasPerson })
      expect(s.sqlite.query('SELECT creator_id FROM entries').get()).toEqual({ creator_id: 'anonymous' })
      const current = await hashToken(s.jar.get('__Host-contributor')!)
      expect(s.sqlite.query('SELECT person_id FROM contributor_sessions WHERE token_hash = ?').get(current)).toEqual({ person_id: atlasPerson })
    } finally { s.sqlite.close() }
  })
  test('competing links and a racing signout cannot revive a rotated session', async () => {
    const s = await setup()
    try {
      const old = 'c'.repeat(64)
      s.sqlite.exec("INSERT INTO persons VALUES ('p', '2020')")
      s.sqlite.query('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await hashToken(old), 'p', '2020', '2099')
      s.jar.set('__Host-contributor', old)
      const first = await s.start()
      const firstFlow = s.jar.get('__Host-atlas-flow')!
      const second = await s.start()
      const secondFlow = s.jar.get('__Host-atlas-flow')!
      s.jar.set('__Host-atlas-flow', firstFlow)
      await expect(callback(s.event(first))).rejects.toMatchObject({ status: 303 })
      const rotated = s.jar.get('__Host-contributor')!
      s.jar.set('__Host-contributor', old)
      s.jar.set('__Host-atlas-flow', secondFlow)
      s.setSubject('bob')
      await expect(callback(s.event(second))).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM atlas_identities').get()).toEqual({ n: 1 })
      s.jar.set('__Host-contributor', rotated)
      s.setSubject('alice')
      await expect(callback(s.event(await s.start()))).rejects.toMatchObject({ status: 303 })
      const grandchild = s.jar.get('__Host-contributor')!
      s.jar.set('__Host-contributor', old)
      await expect(signOut(s.event('/auth/sign-out', 'POST'))).rejects.toMatchObject({ status: 303 })
      s.jar.set('__Host-contributor', grandchild)
      await expect(signIn(s.event('/auth/sign-in', 'POST'))).rejects.toMatchObject({ status: 409 })
    } finally { s.sqlite.close() }
  })
  test('signout invalidates a flow and rejects cross-origin requests', async () => {
    const s = await setup()
    try {
      const path = await s.start()
      const flowCookie = s.jar.get('__Host-atlas-flow')!
      await expect(signOut(s.event('/auth/sign-out', 'POST', 'https://evil.example'))).rejects.toMatchObject({ status: 403 })
      await expect(signOut(s.event('/auth/sign-out', 'POST'))).rejects.toMatchObject({ status: 303 })
      s.jar.set('__Host-atlas-flow', flowCookie)
      await expect(callback(s.event(path))).rejects.toMatchObject({ status: 400 })
    } finally { s.sqlite.close() }
  })
  test('rolls back identity and rotation when session insertion fails', async () => {
    const s = await setup()
    try {
      const old = 'd'.repeat(64)
      s.sqlite.exec("INSERT INTO persons VALUES ('p', '2020')")
      s.sqlite.query('INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await hashToken(old), 'p', '2020', '2099')
      s.jar.set('__Host-contributor', old)
      const path = await s.start()
      s.sqlite.exec("CREATE TRIGGER fail_rotation BEFORE INSERT ON contributor_sessions BEGIN SELECT RAISE(ABORT, 'failure'); END")
      await expect(callback(s.event(path))).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM atlas_identities').get()).toEqual({ n: 0 })
      expect(s.sqlite.query('SELECT revoked_at FROM contributor_sessions').get()).toEqual({ revoked_at: null })
      expect(s.sqlite.query('SELECT count(*) AS n FROM oidc_flows').get()).toEqual({ n: 1 })
      expect(s.jar.get('__Host-contributor')).toBe(old)
    } finally { s.sqlite.close() }
  })
  test('forbids switching accounts in a linked session', async () => {
    const s = await setup()
    try {
      await expect(callback(s.event(await s.start()))).rejects.toMatchObject({ status: 303 })
      s.setSubject('bob')
      await expect(callback(s.event(await s.start()))).rejects.toMatchObject({ status: 409 })
      expect(s.sqlite.query('SELECT count(*) AS n FROM atlas_identities').get()).toEqual({ n: 1 })
    } finally { s.sqlite.close() }
  })
})
