import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { handle } from './hooks.server'
import { MAX_NEW_BODY, MAX_WRITE_BODY } from './lib/server/body-limit'
import { MAX_IMAGE_BYTES } from './lib/server/images'
import { clearJwksCache } from '$lib/server/cf-access'
import { PNG_BYTES, imageFile } from './test-support'

function event(pathname: string, body: string) {
  const request = new Request(`https://example.test${pathname}`, { method: 'POST', body })
  return { request, url: new URL(request.url), route: { id: pathname }, locals: { moderator: null } } as any
}

describe('POST body limit routing', () => {
  test('keeps the small limit on other localized POST routes', async () => {
    let resolved = false
    const response = await handle({
      event: event('/ja/entry/1', 'x'.repeat(MAX_WRITE_BODY + 1)),
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('アップロードが大きすぎます。')
    expect(resolved).toBe(false)
  })

  test('uses the larger limit on the localized new page', async () => {
    let resolved = false
    const e = event('/ja/new', 'x'.repeat(MAX_WRITE_BODY + 1))
    const response = await handle({
      event: e,
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(200)
    expect(resolved).toBe(true)
    expect(e.request.headers.get('content-length')).toBe(String(MAX_WRITE_BODY + 1))
  })

  test('rejects an oversized localized new body before parsing or resolving', async () => {
    let resolved = false
    const e = event('/zh-Hant/new', 'x'.repeat(MAX_NEW_BODY + 1))
    e.request.formData = () => { throw new Error('form parsed') }
    const response = await handle({
      event: e,
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('上傳內容過大。')
    expect(resolved).toBe(false)
  })
})

describe('multipart POST on the localized new page', () => {
  test('reconstructs an 8 MiB multipart body for the form parser', async () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES)
    bytes.set(PNG_BYTES)
    const form = new FormData()
    form.set('script', 'Han')
    form.set('place', 'Book')
    form.set('image', imageFile(bytes))
    const request = new Request('https://example.test/vi/new', { method: 'POST', body: form })

    let kept: Request | undefined
    const response = await handle({
      event: { request, url: new URL(request.url), locals: { moderator: null } } as any,
      resolve: async (resolvedEvent: any) => { kept = resolvedEvent.request; return new Response('ok') },
    } as any)
    expect(response.status).toBe(200)
    expect(kept!.headers.get('content-type')).toContain('multipart/form-data')
    expect(Number(kept!.headers.get('content-length'))).toBeLessThan(MAX_NEW_BODY)

    const parsed = await kept!.formData()
    expect(parsed.get('script')).toBe('Han')
    expect(parsed.get('place')).toBe('Book')
    const file = parsed.get('image') as File
    expect(file.size).toBe(MAX_IMAGE_BYTES)
    expect(new Uint8Array(await file.arrayBuffer()).slice(0, PNG_BYTES.byteLength)).toEqual(PNG_BYTES)
  })
})

describe('html lang', () => {
  const template = '<!doctype html><html lang="%lang%"><head></head><body>%lang%</body></html>'

  async function render(path: string) {
    const event = { request: new Request(`https://example.test${path}`), url: new URL(`https://example.test${path}`), locals: { moderator: null } } as any
    const response = await handle({
      event,
      resolve: async (_event: unknown, options: { transformPageChunk: (input: { html: string; done: boolean }) => string }) => new Response(options.transformPageChunk({ html: template, done: true })),
    } as any)
    return response.text()
  }

  test('sets the language of the address during server rendering', async () => {
    expect(await render('/ja/new')).toContain('<html lang="ja">')
    expect(await render('/zh-Hans')).toContain('<html lang="zh-Hans">')
    expect(await render('/zh-Hant/entry/1')).toContain('<html lang="zh-Hant">')
    expect(await render('/ko')).toContain('<html lang="ko">')
    expect(await render('/vi')).toContain('<html lang="vi">')
  })

  test('uses English for an invalid locale and leaves page text alone', async () => {
    const html = await render('/fr')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<body>%lang%</body>')
  })
})

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
  routeId?: string
}

function makeEvent(path: string, options: EventOptions = {}) {
  const headers = new Headers()
  if (options.token) headers.set('cf-access-jwt-assertion', options.token)
  const url = new URL(`https://example.test${path}`)
  const request = new Request(url, { method: options.method ?? 'GET', headers })
  const locals: App.Locals = { moderator: null }
  const platform = options.platform === false ? undefined : { env: options.env ?? env() }
  const route = options.routeId ? { id: options.routeId } : undefined
  return { event: { request, url, locals, platform, route } as any, locals }
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
    for (const path of ['/en/moderate', '/ja/moderate/', '/zh-Hant/moderate/x', '/en/moderate/1/hide']) {
      const { event, locals } = makeEvent(path, { env: { DB: {} } })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
      expect(locals.moderator).toBeNull()
    }
    expect(fetchCalls).toBe(0)
  })

  test('hides guarded paths without a token', async () => {
    for (const path of ['/en/moderate', '/ko/moderate/1/restore', '/vi/moderate/x', '/%65n/moderate']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('restore') ? 'POST' : 'GET' })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
    expect(fetchCalls).toBe(0)
  })

  test('hides guarded paths with an invalid token', async () => {
    const invalid = await signToken({ secret: otherKeys.privateKey })
    for (const path of ['/en/moderate', '/zh-Hans/moderate/x', '/en/moderate/1/hide']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('hide') ? 'POST' : 'GET', token: invalid })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
  })

  test('hides guarded paths for an unlisted email', async () => {
    const unlisted = await signToken({ email: 'stranger@example.com' })
    for (const path of ['/en/moderate', '/ja/moderate/x']) {
      const { event, locals } = makeEvent(path, { token: unlisted })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(locals.moderator).toBeNull()
    }
  })

  test('hides guarded paths when the key set cannot be fetched', async () => {
    globalThis.fetch = (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    const token = await signToken()
    const { event, locals } = makeEvent('/en/moderate', { token })
    expect((await run(event)).status).toBe(404)
    expect(locals.moderator).toBeNull()
  })

  test('resolves guarded paths and records a verified moderator', async () => {
    const token = await signToken()
    for (const path of ['/en/moderate', '/en/moderate/1/hide']) {
      const { event, locals } = makeEvent(path, { method: path.endsWith('hide') ? 'POST' : 'GET', token })
      const response = await run(event)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('resolved')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(locals.moderator).toBe(EMAIL)
    }
  })

  test('guards the resolved route id even when the path cannot be decoded', async () => {
    const token = await signToken()
    const { event, locals } = makeEvent('/x', { token, routeId: '/[locale]/moderate' })
    expect((await run(event)).status).toBe(200)
    expect(locals.moderator).toBe(EMAIL)
    const denied = makeEvent('/x', { routeId: '/[locale]/moderate' })
    expect((await run(denied.event)).status).toBe(404)
  })

  test('guards other methods on moderation paths', async () => {
    const token = await signToken()
    for (const method of ['OPTIONS', 'PUT', 'DELETE']) {
      const denied = await run(makeEvent('/en/moderate', { method }).event)
      expect(denied.status).toBe(404)
      const allowed = await run(makeEvent('/en/moderate', { method, token }).event)
      expect(allowed.status).toBe(200)
    }
  })

  test('adds frame protection to HTML and keeps moderated pages private', async () => {
    const token = await signToken()
    const resolve = async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } })
    const moderated = await handle({ event: makeEvent('/en/moderate', { token }).event, resolve } as any) as Response
    expect(moderated.headers.get('x-frame-options')).toBe('DENY')
    expect(moderated.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(moderated.headers.get('cache-control')).toBe('private, no-store')
    const publicPage = await handle({ event: makeEvent('/en/entry/1').event, resolve } as any) as Response
    expect(publicPage.headers.get('x-frame-options')).toBe('DENY')
    expect(publicPage.headers.get('cache-control')).toBeNull()
  })

  test('leaves public and lookalike paths reachable without a token', async () => {
    for (const path of ['/en/entry/1', '/en/moderatex', '/ja/moderatex/foo']) {
      const { event, locals } = makeEvent(path)
      const response = await run(event)
      expect(response.status).toBe(200)
      expect(locals.moderator).toBeNull()
    }
  })

  test('sets a verified moderator on an entry page without hiding it', async () => {
    const token = await signToken()
    const { event, locals } = makeEvent('/en/entry/1', { token })
    const response = await run(event)
    expect(response.status).toBe(200)
    expect(locals.moderator).toBe(EMAIL)
  })

  test('does not hide public paths when the token is invalid', async () => {
    const invalid = await signToken({ secret: otherKeys.privateKey })
    const { event, locals } = makeEvent('/en/entry/1', { token: invalid })
    const response = await run(event)
    expect(response.status).toBe(200)
    expect(locals.moderator).toBeNull()
  })

  test('fails closed when the platform is unavailable', async () => {
    const { event } = makeEvent('/en/moderate', { platform: false })
    expect((await run(event)).status).toBe(404)
  })
})
