import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { handle } from './hooks.server'
import { clearJwksCache } from '$lib/server/cf-access'

const TEAM = 'hook.example.cloudflareaccess.com'
const ISSUER = `https://${TEAM}`
const AUD = 'hook-aud'
const EMAIL = 'mod@example.com'
const NOW_SECONDS = Math.floor(Date.now() / 1000)

const { publicKey, privateKey } = await generateKeyPair('RS256')
const otherKeys = await generateKeyPair('RS256')
const publicJwk = { ...(await exportJWK(publicKey)), kid: 'hook-key', alg: 'RS256', use: 'sig' }

async function signToken(overrides: { email?: string; secret?: CryptoKey } = {}): Promise<string> {
  return new SignJWT({ sub: 'user-1', email: overrides.email ?? EMAIL })
    .setProtectedHeader({ alg: 'RS256', kid: 'hook-key' })
    .setIssuer(ISSUER)
    .setAudience(AUD)
    .setIssuedAt(NOW_SECONDS)
    .setExpirationTime(NOW_SECONDS + 300)
    .sign(overrides.secret ?? privateKey)
}

const originalFetch = globalThis.fetch
let fetchCalls = 0

beforeEach(() => {
  clearJwksCache()
  fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls++
    return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearJwksCache()
})

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    DB: {},
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    MODERATOR_EMAILS: EMAIL,
    ...overrides,
  }
}

type EventOptions = {
  method?: string
  token?: string
  env?: Record<string, unknown>
  platform?: boolean
}

function makeEvent(path: string, options: EventOptions = {}) {
  const headers = new Headers()
  if (options.token) headers.set('cf-access-jwt-assertion', options.token)
  const url = new URL(`https://example.test${path}`)
  const request = new Request(url, { method: options.method ?? 'GET', headers })
  const locals: App.Locals = { moderator: null }
  const platform = options.platform === false ? undefined : { env: options.env ?? env() }
  return { event: { request, url, locals, platform } as any, locals }
}

async function run(event: any): Promise<Response> {
  return await handle({
    event,
    resolve: async () => new Response('resolved', { status: 200 }),
  } as any) as Response
}

describe('moderation hook', () => {
  test('hides guarded paths without configuration', async () => {
    // SvelteKit normalizes a trailing slash before this hook runs in production.
    for (const path of ['/moderate', '/moderate/', '/moderate/x', '/moderate/1/hide']) {
      const { event, locals } = makeEvent(path, { env: { DB: {} } })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
      expect(locals.moderator).toBeNull()
    }
    expect(fetchCalls).toBe(0)
  })

  test('hides guarded paths without a token', async () => {
    for (const path of ['/moderate', '/moderate/1/restore', '/moderate/x', '/moderate/reports', '/%6Doderate']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('restore') ? 'POST' : 'GET' })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
    expect(fetchCalls).toBe(0)
  })

  test('hides guarded paths with an invalid token', async () => {
    const invalid = await signToken({ secret: otherKeys.privateKey })
    for (const path of ['/moderate', '/moderate/x', '/moderate/1/hide']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('hide') ? 'POST' : 'GET', token: invalid })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
  })

  test('hides guarded paths for an unlisted email', async () => {
    const unlisted = await signToken({ email: 'stranger@example.com' })
    for (const path of ['/moderate', '/moderate/x']) {
      const { event, locals } = makeEvent(path, { token: unlisted })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
  })

  test('hides guarded paths when the key set cannot be fetched', async () => {
    globalThis.fetch = (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    const token = await signToken()
    const { event, locals } = makeEvent('/moderate', { token })
    expect((await run(event)).status).toBe(404)
    expect(locals.moderator).toBeNull()
  })

  test('resolves guarded paths and records a verified moderator', async () => {
    const token = await signToken()
    for (const path of ['/moderate', '/moderate/1/hide', '/moderate/reports']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('hide') ? 'POST' : 'GET', token })
      const response = await run(event)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('resolved')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(locals.moderator).toBe(EMAIL)
    }
  })

  test('guards other methods on moderation paths', async () => {
    const token = await signToken()
    for (const method of ['OPTIONS', 'PUT', 'DELETE']) {
      const denied = await run(makeEvent('/moderate', { method }).event)
      expect(denied.status).toBe(404)
      const allowed = await run(makeEvent('/moderate', { method, token }).event)
      expect(allowed.status).toBe(200)
    }
  })

  test('adds frame protection to HTML and keeps moderated pages private', async () => {
    const token = await signToken()
    const resolve = async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } })
    const moderated = await handle({ event: makeEvent('/moderate', { token }).event, resolve } as any) as Response
    expect(moderated.headers.get('x-frame-options')).toBe('DENY')
    expect(moderated.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(moderated.headers.get('cache-control')).toBe('private, no-store')
    const publicPage = await handle({ event: makeEvent('/entry/1').event, resolve } as any) as Response
    expect(publicPage.headers.get('x-frame-options')).toBe('DENY')
    expect(publicPage.headers.get('cache-control')).toBeNull()
  })

  test('leaves public and lookalike paths reachable without a token', async () => {
    for (const path of ['/entry/1', '/moderatex', '/moderatex/foo']) {
      const { event, locals } = makeEvent(path)
      const response = await run(event)
      expect(response.status).toBe(200)
      expect(locals.moderator).toBeNull()
    }
  })

  test('sets a verified moderator on an entry page without hiding it', async () => {
    const token = await signToken()
    const { event, locals } = makeEvent('/entry/1', { token })
    const response = await run(event)
    expect(response.status).toBe(200)
    expect(locals.moderator).toBe(EMAIL)
  })

  test('does not hide public paths when the token is invalid', async () => {
    const invalid = await signToken({ secret: otherKeys.privateKey })
    const { event, locals } = makeEvent('/entry/1', { token: invalid })
    const response = await run(event)
    expect(response.status).toBe(200)
    expect(locals.moderator).toBeNull()
  })

  test('fails closed when the platform is unavailable', async () => {
    const { event } = makeEvent('/moderate', { platform: false })
    expect((await run(event)).status).toBe(404)
  })
})
