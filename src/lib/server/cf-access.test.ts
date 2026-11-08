import { beforeEach, describe, expect, test } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import {
  authenticateModerator,
  clearJwksCache,
  readModeratorConfig,
  verifyModeratorAssertion,
} from './cf-access'

const TEAM = 'example.cloudflareaccess.com'
const ISSUER = `https://${TEAM}`
const AUD = 'access-aud-tag'
const KEY_ID = 'test-key'
const NOW = 1_800_000_000_000
const NOW_SECONDS = Math.floor(NOW / 1000)

const { publicKey, privateKey } = await generateKeyPair('RS256')
const publicJwk = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }

function config(team = TEAM) {
  const result = readModeratorConfig({
    ACCESS_TEAM_DOMAIN: team,
    ACCESS_AUD: AUD,
    MODERATOR_EMAILS: 'mod@example.com, second@example.com',
  })
  if (!result) throw new Error('test config is invalid')
  return result
}

type TokenOverrides = {
  email?: string | null
  issuer?: string
  audience?: string
  iat?: number
  exp?: number
}

async function signToken(overrides: TokenOverrides = {}): Promise<string> {
  const payload: Record<string, unknown> = { sub: 'user-1' }
  const email = overrides.email === undefined ? 'mod@example.com' : overrides.email
  if (email !== null) payload.email = email
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? AUD)
    .setIssuedAt(overrides.iat ?? NOW_SECONDS)
    .setExpirationTime(overrides.exp ?? NOW_SECONDS + 300)
    .sign(privateKey)
}

function jwksResponse(keys: object[] = [publicJwk], status = 200): Response {
  return new Response(JSON.stringify({ keys }), { status, headers: { 'content-type': 'application/json' } })
}

type FetchProbe = { calls: number; requests: { url: string; redirect: string | undefined }[] }

function keyFetch(keys: object[] = [publicJwk]): { fetch: typeof fetch; probe: FetchProbe } {
  const probe: FetchProbe = { calls: 0, requests: [] }
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    probe.calls++
    probe.requests.push({ url: String(input), redirect: init?.redirect })
    return jwksResponse(keys)
  }) as typeof fetch
  return { fetch: fetchImpl, probe }
}

async function verify(token: string, options: Parameters<typeof verifyModeratorAssertion>[2] = {}) {
  return verifyModeratorAssertion(token, config(), { now: () => NOW, ...options })
}

beforeEach(() => clearJwksCache())

describe('moderator configuration', () => {
  test('accepts a lowercase hostname, audience and normalized allowlist', () => {
    const result = readModeratorConfig({
      ACCESS_TEAM_DOMAIN: ' Example.CloudflareAccess.com ',
      ACCESS_AUD: ' aud ',
      MODERATOR_EMAILS: 'Mod@Example.COM , second@example.com,mod@example.com',
    })
    expect(result).toBeNull()

    const valid = readModeratorConfig({
      ACCESS_TEAM_DOMAIN: ' example.cloudflareaccess.com ',
      ACCESS_AUD: ' aud ',
      MODERATOR_EMAILS: 'Mod@Example.COM , second@example.com,mod@example.com',
    })
    expect(valid).toEqual({
      teamDomain: TEAM,
      audience: 'aud',
      emails: ['mod@example.com', 'second@example.com'],
      issuer: ISSUER,
      certsUrl: `${ISSUER}/cdn-cgi/access/certs`,
    })
  })

  test('rejects malformed team domains', () => {
    const bad = [
      undefined,
      '',
      'example',
      'https://example.cloudflareaccess.com',
      'example.cloudflareaccess.com/path',
      'user@example.cloudflareaccess.com',
      'Example.cloudflareaccess.com',
      'example.cloudflareaccess.com:443',
      'example..cloudflareaccess.com',
      '.example.cloudflareaccess.com',
      'example.cloudflareaccess.com.',
      '-example.cloudflareaccess.com',
      'example-.cloudflareaccess.com',
      'exa_mple.cloudflareaccess.com',
      '127.0.0.1',
    ]
    for (const team of bad) {
      expect(readModeratorConfig({
        ACCESS_TEAM_DOMAIN: team,
        ACCESS_AUD: AUD,
        MODERATOR_EMAILS: 'mod@example.com',
      })).toBeNull()
    }
  })

  test('rejects an empty audience or allowlist', () => {
    for (const audience of [undefined, '', '   ']) {
      expect(readModeratorConfig({
        ACCESS_TEAM_DOMAIN: TEAM,
        ACCESS_AUD: audience,
        MODERATOR_EMAILS: 'mod@example.com',
      })).toBeNull()
    }
    for (const emails of [undefined, '', ' ', ',', 'mod@example.com,']) {
      expect(readModeratorConfig({
        ACCESS_TEAM_DOMAIN: TEAM,
        ACCESS_AUD: AUD,
        MODERATOR_EMAILS: emails,
      })).toBeNull()
    }
  })

  test('rejects an oversized or implausible allowlist', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `user${index}@example.com`).join(',')
    expect(readModeratorConfig({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, MODERATOR_EMAILS: twenty })?.emails).toHaveLength(20)
    const twentyOne = Array.from({ length: 21 }, (_, index) => `user${index}@example.com`).join(',')
    expect(readModeratorConfig({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, MODERATOR_EMAILS: twentyOne })).toBeNull()

    for (const email of ['a@b', '@example.com', 'a@@example.com', 'a b@example.com', 'a@example..com', `${'a'.repeat(310)}@example.com`]) {
      expect(readModeratorConfig({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, MODERATOR_EMAILS: email })).toBeNull()
    }
  })
})

describe('Access JWT verification', () => {
  test('accepts a valid token from an allowlisted email', async () => {
    const { fetch, probe } = keyFetch()
    const token = await signToken()
    expect(await verify(token, { fetch })).toBe('mod@example.com')
    expect(probe.calls).toBe(1)
    expect(probe.requests[0]).toEqual({ url: `${ISSUER}/cdn-cgi/access/certs`, redirect: 'error' })
  })

  test('matches the allowlist case-insensitively and tolerates small clock skew', async () => {
    const { fetch } = keyFetch()
    expect(await verify(await signToken({ email: 'MOD@example.com' }), { fetch })).toBe('MOD@example.com')
    expect(await verify(await signToken({ exp: NOW_SECONDS - 30 }), { fetch })).toBe('mod@example.com')
  })

  test('rejects wrong audience, issuer, expiration and missing claims', async () => {
    const { fetch } = keyFetch()
    expect(await verify(await signToken({ audience: 'other-aud' }), { fetch })).toBeNull()
    expect(await verify(await signToken({ issuer: 'https://other.cloudflareaccess.com' }), { fetch })).toBeNull()
    expect(await verify(await signToken({ exp: NOW_SECONDS - 120 }), { fetch })).toBeNull()
    expect(await verify(await signToken({ iat: NOW_SECONDS + 120 }), { fetch })).toBeNull()
    expect(await verify(await signToken({ email: null }), { fetch })).toBeNull()
    expect(await verify(await signToken({ email: 'stranger@example.com' }), { fetch })).toBeNull()
  })

  test('rejects HS256, none and malformed tokens before trusting a key', async () => {
    const { fetch, probe } = keyFetch()
    const hs256 = await new SignJWT({ sub: 'user-1', email: 'mod@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setIssuedAt(NOW_SECONDS)
      .setExpirationTime(NOW_SECONDS + 300)
      .sign(new TextEncoder().encode('secret'))

    expect(await verify(hs256, { fetch })).toBeNull()
    expect(await verify('not-a-jwt', { fetch })).toBeNull()
    expect(await verify('a.b.c', { fetch })).toBeNull()

    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const none = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: ISSUER, aud: AUD, sub: 'user-1', email: 'mod@example.com', iat: NOW_SECONDS, exp: NOW_SECONDS + 300 })}.`
    expect(await verify(none, { fetch })).toBeNull()
    expect(probe.calls).toBe(0)
  })

  test('rejects a request without the Access assertion header and ignores fallback headers', async () => {
    const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, MODERATOR_EMAILS: 'mod@example.com' }
    expect(await authenticateModerator(new Request('https://example.test/moderate'), env)).toBeNull()
    const fallback = new Request('https://example.test/moderate', {
      headers: { 'x-forwarded-email': 'mod@example.com', 'x-auth-request-email': 'mod@example.com' },
    })
    expect(await authenticateModerator(fallback, env)).toBeNull()
    expect(await authenticateModerator(new Request('https://example.test/moderate'), {})).toBeNull()
  })
})

describe('Access JWKS fetching', () => {
  test('rejects a key set over the body cap', async () => {
    const token = await signToken()
    const fetchImpl = (async () => new Response(JSON.stringify({ keys: [publicJwk], pad: 'x'.repeat(140 * 1024) }))) as unknown as typeof fetch
    expect(await verify(token, { fetch: fetchImpl })).toBeNull()
  })

  test('rejects a key set that exceeds the deadline', async () => {
    const token = await signToken()
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      return await new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }) as typeof fetch
    expect(await verify(token, { fetch: fetchImpl, timeoutMs: 10 })).toBeNull()
  })

  test('rejects redirects and failed downloads', async () => {
    const token = await signToken()
    const redirectFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe('error')
      return new Response(null, { status: 302, headers: { location: 'https://attacker.test/certs' } })
    }) as typeof fetch
    expect(await verify(token, { fetch: redirectFetch })).toBeNull()

    const throwingFetch = (async () => { throw new TypeError('redirect mode is set to error') }) as unknown as typeof fetch
    expect(await verify(token, { fetch: throwingFetch })).toBeNull()

    const errorFetch = (async () => jwksResponse([publicJwk], 500)) as unknown as typeof fetch
    expect(await verify(token, { fetch: errorFetch })).toBeNull()

    const malformedFetch = (async () => new Response('{')) as unknown as typeof fetch
    expect(await verify(token, { fetch: malformedFetch })).toBeNull()

    const emptyFetch = (async () => jwksResponse([])) as unknown as typeof fetch
    expect(await verify(token, { fetch: emptyFetch })).toBeNull()
  })

  test('caches successful key sets and briefly caches failures', async () => {
    const token = await signToken()
    const { fetch, probe } = keyFetch()
    expect(await verify(token, { fetch })).toBe('mod@example.com')
    expect(await verify(token, { fetch })).toBe('mod@example.com')
    expect(probe.calls).toBe(1)

    clearJwksCache()
    let calls = 0
    const flaky = (async () => {
      calls++
      if (calls === 1) throw new TypeError('network down')
      return jwksResponse()
    }) as unknown as typeof fetch
    expect(await verify(token, { fetch: flaky })).toBeNull()
    expect(await verify(token, { fetch: flaky })).toBeNull()
    expect(calls).toBe(1)
    expect(await verifyModeratorAssertion(token, config(), { now: () => NOW + 31_000, fetch: flaky })).toBe('mod@example.com')
    expect(calls).toBe(2)
  })
})
