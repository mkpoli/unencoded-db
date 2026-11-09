import { afterEach, describe, expect, test } from 'bun:test'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { discover, fetchJson, validateIssuer, verifyIdentity } from './oidc'
import { configured } from './auth'

const issuer = 'https://identity.example'
const config = { issuer, clientId: 'atlas-client', clientSecret: 'secret' }
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

describe('OIDC discovery and ID tokens', () => {
  test('bounds provider response headers, streaming bodies and time', async () => {
    globalThis.fetch = (async () => new Response('{}', { headers: { 'content-length': '100' } })) as unknown as typeof fetch
    await expect(fetchJson(`${issuer}/test`, {}, 8)).rejects.toThrow('too large')
    globalThis.fetch = (async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); controller.close() } }))) as unknown as typeof fetch
    await expect(fetchJson(`${issuer}/test`, {}, 8)).rejects.toThrow('too large')
    let cancelled = false
    globalThis.fetch = (async () => new Response(new ReadableStream({ cancel() { cancelled = true } }))) as unknown as typeof fetch
    await expect(fetchJson(`${issuer}/test`, {}, 8, 20)).rejects.toThrow('timed out')
    expect(cancelled).toBe(true)
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch
    await expect(fetchJson(`${issuer}/test`, {}, 8, 20)).rejects.toThrow('timed out')
  })
  test('uses a redirect mode Workers fetch accepts and rejects redirects', async () => {
    let mode: string | undefined
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => { mode = init?.redirect; return Response.json({}) }) as unknown as typeof fetch
    await fetchJson(`${issuer}/test`)
    expect(mode).toBe('manual')
    globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: `${issuer}/elsewhere` } })) as unknown as typeof fetch
    await expect(fetchJson(`${issuer}/test`)).rejects.toThrow('Provider request failed')
  })
  test('allows only pinned HTTPS or loopback HTTP public origins', () => {
    const env = { DB: {} as D1Database, IMAGES: {} as R2Bucket, ATLAS_ISSUER: issuer, ATLAS_CLIENT_ID: 'client', ATLAS_CLIENT_SECRET: 'secret', ATLAS_PUBLIC_ORIGIN: 'http://localhost:5173' }
    expect(configured(env, new URL('http://localhost:5173/a'))).toBe(true)
    expect(configured({ ...env, ATLAS_PUBLIC_ORIGIN: 'http://localhost.example:5173' }, new URL('http://localhost.example:5173'))).toBe(false)
    expect(configured({ ...env, ATLAS_PUBLIC_ORIGIN: 'http://localhost:5173/path' }, new URL('http://localhost:5173'))).toBe(false)
    expect(configured(env, new URL('http://localhost:5174'))).toBe(false)
  })
  test('pins discovery issuer and endpoints', async () => {
    expect(() => validateIssuer('http://identity.example')).toThrow()
    const metadata = { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/keys` }
    globalThis.fetch = (async () => Response.json(metadata)) as unknown as typeof fetch
    expect(await discover(issuer)).toEqual(metadata)
    for (const bad of [{ ...metadata, issuer: `${issuer}/other` }, { ...metadata, token_endpoint: 'https://attacker.example/token' }, { ...metadata, authorization_endpoint: `${issuer}/authorize?state=attacker` }]) {
      globalThis.fetch = (async () => Response.json(bad)) as unknown as typeof fetch
      await expect(discover(issuer)).rejects.toThrow()
    }
  })

  test('requires the signature, issuer, audience, authorized party, nonce and fresh iat', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    const jwk = { ...await exportJWK(publicKey), kid: 'key' }
    globalThis.fetch = (async () => Response.json({ keys: [jwk] })) as unknown as typeof fetch
    const now = Math.floor(Date.now() / 1000)
    const make = async (claims: Record<string, unknown> = {}) => new SignJWT({ iss: issuer, sub: 'subject', aud: config.clientId, nonce: 'nonce', iat: now, exp: now + 300, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'key' }).sign(privateKey)
    expect(await verifyIdentity(await make(), `${issuer}/keys`, config, 'nonce')).toEqual({ issuer, subject: 'subject' })
    for (const claims of [{ iss: 'https://evil.example' }, { aud: 'other' }, { aud: [config.clientId, 'other'] }, { aud: [config.clientId, 'other'], azp: config.clientId }, { azp: 'other' }, { nonce: 'wrong' }, { iat: now + 120 }, { iat: now - 601 }, { exp: now - 120 }, { sub: '' }]) {
      await expect(verifyIdentity(await make(claims), `${issuer}/keys`, config, 'nonce')).rejects.toThrow()
    }
    const other = await generateKeyPair('RS256')
    const forged = await new SignJWT({ iss: issuer, sub: 'subject', aud: config.clientId, nonce: 'nonce', iat: now, exp: now + 300 }).setProtectedHeader({ alg: 'RS256', kid: 'key' }).sign(other.privateKey)
    await expect(verifyIdentity(forged, `${issuer}/keys`, config, 'nonce')).rejects.toThrow()
  })
})
