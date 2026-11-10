import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import type { RequestEvent } from '@sveltejs/kit'
import { handle } from './hooks.server'
import { MAX_IMAGE_BODY, MAX_WRITE_BODY } from './lib/server/body-limit'
import { MAX_IMAGE_BYTES } from './lib/server/images'
import { clearJwksCache } from '$lib/server/cf-access'
import { PNG_BYTES, imageFile } from './test-support'

function event(pathname: string, body: string, routeId = pathname) {
  const request = new Request(`https://example.test${pathname}`, { method: 'POST', body })
  return {
    request,
    url: new URL(request.url),
    route: { id: routeId },
    locals: { moderator: null },
    getClientAddress: () => '203.0.113.1',
    platform: { cf: {}, env: { CONTRIBUTION_RATE_LIMIT: { limit: async () => ({ success: true }) } } },
  } as any
}

describe('POST body limit routing', () => {
  test('keeps the small limit on other localized POST routes', async () => {
    let resolved = false
    const response = await handle({
      event: event('/ja/entry/1/history', 'x'.repeat(MAX_WRITE_BODY + 1)),
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(413)
    expect(await response.text()).toBe('アップロードが大きすぎます。')
    expect(resolved).toBe(false)
  })

  test('uses the larger limit on the localized image routes', async () => {
    for (const [path, route] of [
      ['/ja/new', '/[locale]/new'], ['/ja/batch', '/[locale]/batch'],
      ['/ja/entry/1', '/[locale]/entry/[id]'], ['/ja/entry/1/edit', '/[locale]/entry/[id]/edit'],
    ] as const) {
      let resolved = false
      const e = event(path, 'x'.repeat(MAX_WRITE_BODY + 1), route)
      const response = await handle({
        event: e,
        resolve: async () => { resolved = true; return new Response('ok') },
      } as any)
      expect(response.status, path).toBe(200)
      expect(resolved, path).toBe(true)
      expect(e.request.headers.get('content-length'), path).toBe(String(MAX_WRITE_BODY + 1))
    }
  })

  test('uses the resolved route id for encoded image paths', async () => {
    let resolved = false
    const e = event('/ja/%65ntry/%31', 'x'.repeat(MAX_WRITE_BODY + 1), '/[locale]/entry/[id]')
    const response = await handle({
      event: e,
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(200)
    expect(resolved).toBe(true)
  })

  test('rejects an oversized body on every image route before parsing', async () => {
    for (const [path, route] of [
      ['/ja/new', '/[locale]/new'], ['/ja/batch', '/[locale]/batch'],
      ['/ja/entry/1', '/[locale]/entry/[id]'], ['/ja/entry/1/edit', '/[locale]/entry/[id]/edit'],
    ] as const) {
      let resolved = false
      const e = event(path, 'x'.repeat(MAX_IMAGE_BODY + 1), route)
      e.request.formData = () => { throw new Error('form parsed') }
      const response = await handle({
        event: e,
        resolve: async () => { resolved = true; return new Response('ok') },
      } as any)
      expect(response.status, path).toBe(413)
      expect(await response.text(), path).toBe('アップロードが大きすぎます。')
      expect(resolved, path).toBe(false)
    }
  })
})

describe('multipart POST on the localized new page', () => {
  test('reconstructs a 16 MiB multipart body for the form parser', async () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES)
    bytes.set(PNG_BYTES)
    const form = new FormData()
    form.set('script', 'Han')
    form.set('place', 'Book')
    form.set('image', imageFile(bytes))
    const request = new Request('https://example.test/vi/new', { method: 'POST', body: form })

    let kept: Request | undefined
    const response = await handle({
      event: {
        request,
        url: new URL(request.url),
        route: { id: '/[locale]/new' },
        locals: { moderator: null },
        getClientAddress: () => '203.0.113.1',
        platform: { cf: {}, env: { CONTRIBUTION_RATE_LIMIT: { limit: async () => ({ success: true }) } } },
      } as any,
      resolve: async (resolvedEvent: any) => { kept = resolvedEvent.request; return new Response('ok') },
    } as any)
    expect(response.status).toBe(200)
    expect(kept!.headers.get('content-type')).toContain('multipart/form-data')
    expect(Number(kept!.headers.get('content-length'))).toBeLessThan(MAX_IMAGE_BODY)

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
    for (const path of ['/en/moderate', '/ja/moderate/', '/zh-Hant/moderate/x', '/en/moderate/1/hide', '/en/moderate/reports']) {
      const { event, locals } = makeEvent(path, { env: { DB: {} } })
      const response = await run(event)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
      expect(locals.moderator).toBeNull()
    }
    expect(fetchCalls).toBe(0)
  })

  test('hides guarded paths without a token', async () => {
    for (const path of ['/en/moderate', '/ko/moderate/1/restore', '/vi/moderate/x', '/%65n/moderate', '/ja/moderate/reports']) {
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
    for (const path of ['/en/moderate', '/en/moderate/1/hide', '/en/moderate/reports']) {
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

type Limiter = { limit: (input: { key: string }) => Promise<{ success: boolean }> }

function rateEvent(options: { path?: string, locale?: string, method?: string, body?: string, address?: string, cf?: boolean, local?: string, limiter?: Limiter, enhanced?: boolean, route?: string | null } = {}) {
  const path = options.path ?? `/${options.locale ?? 'ja'}/new`
  const method = options.method ?? 'POST'
  const request = new Request(`http://localhost${path}`, { method, headers: options.enhanced ? { 'x-sveltekit-action': 'true' } : {}, ...(method === 'POST' ? { body: options.body ?? 'hello' } : {}) })
  const event = {
    request, url: new URL(request.url), route: { id: options.route === undefined ? '/[locale]/new' : options.route },
    locals: { moderator: null },
    getClientAddress: () => options.address ?? '192.0.2.1',
    platform: { env: { CONTRIBUTION_RATE_LIMIT: options.limiter, LOCAL_RATE_LIMIT: options.local }, ...(options.cf === false ? {} : { cf: {} }) }
  } as unknown as RequestEvent
  let resolved = false
  const run = () => handle({ event, resolve: async () => { resolved = true; return new Response('ok') } } as Parameters<typeof handle>[0])
  return { request, event, run, resolved: () => resolved }
}

const allow: Limiter = { limit: async () => ({ success: true }) }
const deny: Limiter = { limit: async () => ({ success: false }) }
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')

describe('contribution rate limit hook', () => {
  test('allows requests and reads their bodies after checking the key', async () => {
    let key = ''
    const ctx = rateEvent({ limiter: { limit: async input => { key = input.key; expect(ctx.request.bodyUsed).toBe(false); return { success: true } } } })
    expect((await ctx.run()).status).toBe(200)
    expect(key).toBe(await digest('192.0.2.1'))
    expect(ctx.request.bodyUsed).toBe(true)
    expect(await ctx.event.request.text()).toBe('hello')
    expect(ctx.resolved()).toBe(true)
  })
  test('passes limiter decisions at the five-request window boundary', async () => {
    let count = 0
    const limiter: Limiter = { limit: async () => ({ success: ++count <= 5 }) }
    for (let n = 0; n < 5; n++) expect((await rateEvent({ limiter }).run()).status).toBe(200)
    const blocked = rateEvent({ limiter })
    expect((await blocked.run()).status).toBe(429)
    expect(blocked.request.bodyUsed).toBe(false)
    count = 0 // Simulate a provider window reset.
    expect((await rateEvent({ limiter }).run()).status).toBe(200)
  })
  test('blocks before body consumption and resolution', async () => {
    const ctx = rateEvent({ limiter: deny, body: 'x'.repeat(MAX_WRITE_BODY + 1) })
    const response = await ctx.run()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toContain('リクエストが多すぎます')
    expect(ctx.request.bodyUsed).toBe(false)
    expect(ctx.resolved()).toBe(false)
  })
  test('renders the limited page in the request locale', async () => {
    for (const [locale, text] of [['en', 'Too many requests'], ['zh-Hant', '要求過多'], ['vi', 'Quá nhiều yêu cầu'], ['ko', '요청이 너무 많습니다']] as const) {
      const ctx = rateEvent({ locale, limiter: deny })
      const response = await ctx.run()
      expect(response.status).toBe(429)
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      const html = await response.text()
      expect(html).toContain(`<html lang="${locale}">`)
      expect(html).toContain(text)
    }
  })
  test('returns an enhanced action failure without consuming the body', async () => {
    const ctx = rateEvent({ limiter: deny, enhanced: true })
    const response = await ctx.run()
    expect(response.status).toBe(429)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ type: 'failure', status: 429 })
    expect(ctx.request.bodyUsed).toBe(false)
    expect(ctx.resolved()).toBe(false)
  })
  test('fails closed before reading when provider is missing or fails', async () => {
    for (const limiter of [undefined, { limit: async () => { throw new Error('offline') } }, { limit: async () => ({} as { success: boolean }) }]) {
      const ctx = rateEvent({ limiter })
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
  })
  test('returns enhanced unavailable failures before reading the body', async () => {
    for (const options of [
      { limiter: undefined },
      { limiter: allow, address: '' },
      { limiter: { limit: async () => { throw new Error('offline') } } },
      { limiter: { limit: async () => ({} as { success: boolean }) } }
    ]) {
      const ctx = rateEvent({ ...options, enhanced: true })
      const response = await ctx.run()
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ type: 'failure', status: 503 })
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
    const plain = rateEvent({ locale: 'en' })
    const response = await plain.run()
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Contributions are temporarily unavailable. Try again later.')
  })
  test('rejects missing or malformed production addresses', async () => {
    for (const address of ['', 'garbage', '192.0.2.1, 192.0.2.2']) {
      const ctx = rateEvent({ address, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
    }
  })
  test('fails closed on IPv4-mapped IPv6 addresses', async () => {
    for (const address of ['::ffff:192.0.2.1', '::ffff:c000:201', '0:0:0:0:0:ffff:c633:6401']) {
      const ctx = rateEvent({ address, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
  })
  test('groups canonical IPv6 addresses by /64 prefix', async () => {
    const keys: string[] = []
    const limiter: Limiter = { limit: async input => { keys.push(input.key); return { success: true } } }
    for (const address of ['2001:0db8:0:1:0:0:0:1', '2001:db8:0:1::ffff', '2001:db8:0:2::1', '::1']) {
      expect((await rateEvent({ address, limiter }).run()).status).toBe(200)
    }
    expect(keys[0]).toBe(await digest('ipv6-64:2001:0db8:0000:0001'))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
    expect(keys[3]).toBe(await digest('ipv6-64:0000:0000:0000:0000'))
  })
  test('local mode requires explicit flag and loopback URL and address', async () => {
    for (const opts of [{ cf: false, address: '127.0.0.1' }, { cf: false, local: 'true', address: '192.0.2.1' }]) {
      const ctx = rateEvent({ ...opts, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
    }
    let key = ''
    const ctx = rateEvent({ local: 'true', address: '127.0.0.1', limiter: { limit: async input => { key = input.key; return { success: true } } } })
    expect((await ctx.run()).status).toBe(200)
    expect(key).toBe(await digest('local-loopback'))
    const remote = rateEvent({ cf: false, local: 'true', address: '127.0.0.1', limiter: allow })
    remote.event.url = new URL('http://example.test/ja/new')
    expect((await remote.run()).status).toBe(503)
  })
  test('other POST routes, other locales and GETs do not use the provider', async () => {
    for (const options of [{ route: '/[locale]/entry/[id]' }, { route: null }, { method: 'GET' }]) {
      const ctx = rateEvent(options)
      expect((await ctx.run()).status).toBe(200)
      expect(ctx.resolved()).toBe(true)
    }
  })
  test('still rejects an oversized body on the localized new page after the limiter allows it', async () => {
    const exact = rateEvent({ body: 'x'.repeat(MAX_IMAGE_BODY), limiter: allow })
    expect((await exact.run()).status).toBe(200)
    const over = rateEvent({ body: 'x'.repeat(MAX_IMAGE_BODY + 1), limiter: allow })
    expect((await over.run()).status).toBe(413)
    const small = rateEvent({ body: 'x'.repeat(MAX_WRITE_BODY + 1), limiter: allow })
    expect((await small.run()).status).toBe(200)
  })
})
