import { describe, expect, test } from 'bun:test'
import type { RequestEvent } from '@sveltejs/kit'
import { handle } from './hooks.server'
import { MAX_WRITE_BODY } from './lib/server/body-limit'

type Limiter = { limit: (input: { key: string }) => Promise<{ success: boolean }> }

function setup(options: { path?: string, method?: string, body?: string, address?: string, cf?: boolean, local?: string, limiter?: Limiter, enhanced?: boolean, newRecordsPaused?: string } = {}) {
  const path = options.path ?? '/new'
  const method = options.method ?? 'POST'
  const request = new Request(`http://localhost${path}`, { method, headers: options.enhanced ? { 'x-sveltekit-action': 'true' } : {}, ...(method === 'POST' ? { body: options.body ?? 'hello' } : {}) })
  const event = {
    request, url: new URL(request.url), route: { id: path === '/unknown' ? null : path },
    getClientAddress: () => options.address ?? '192.0.2.1',
    platform: { env: { CONTRIBUTION_RATE_LIMIT: options.limiter, LOCAL_RATE_LIMIT: options.local, NEW_RECORDS_PAUSED: 'newRecordsPaused' in options ? options.newRecordsPaused : '0' }, ...(options.cf === false ? {} : { cf: {} }) }
  } as unknown as RequestEvent
  let resolved = false
  const run = () => handle({ event, resolve: async () => { resolved = true; return new Response('ok') } } as Parameters<typeof handle>[0])
  return { request, event, run, resolved: () => resolved }
}

const allow: Limiter = { limit: async () => ({ success: true }) }
const deny: Limiter = { limit: async () => ({ success: false }) }
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')

describe('contribution write pause', () => {
  test('fails closed before the limiter and body for missing, paused and malformed values', async () => {
    for (const newRecordsPaused of [undefined, '1', '', 'true', 'false', ' 0', '0 ', '00']) {
      let calls = 0
      const ctx = setup({ newRecordsPaused, enhanced: true, body: 'draft', limiter: { limit: async () => { calls++; return { success: true } } } })
      const response = await ctx.run()
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ type: 'failure', status: 503 })
      expect(calls).toBe(0)
      expect(ctx.request.bodyUsed).toBe(false)
      expect(await ctx.request.text()).toBe('draft')
      expect(ctx.resolved()).toBe(false)
    }
  })
  test('returns a plain unavailable response without JavaScript', async () => {
    const ctx = setup({ newRecordsPaused: '1', limiter: allow })
    const response = await ctx.run()
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Contributions are temporarily unavailable')
    expect(ctx.request.bodyUsed).toBe(false)
  })
  test('opens only for 0 and still applies the limiter', async () => {
    let calls = 0
    const ctx = setup({ newRecordsPaused: '0', limiter: { limit: async () => { calls++; return { success: false } } } })
    expect((await ctx.run()).status).toBe(429)
    expect(calls).toBe(1)
    expect(ctx.request.bodyUsed).toBe(false)
  })
  test('does not block GETs or other POST routes while paused', async () => {
    for (const options of [{ method: 'GET' }, { method: 'GET', path: '/' }, { path: '/sign-out' }, { path: '/moderation' }]) {
      const ctx = setup({ ...options, newRecordsPaused: '1' })
      expect((await ctx.run()).status).toBe(200)
      expect(ctx.resolved()).toBe(true)
    }
  })
  test('fails closed when platform or environment is absent', async () => {
    for (const platform of [undefined, {}]) {
      const ctx = setup({ limiter: allow })
      ctx.event.platform = platform as RequestEvent['platform']
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
  })
})

describe('contribution rate limit hook', () => {
  test('allows requests and reads their bodies after checking the key', async () => {
    let key = ''
    const ctx = setup({ limiter: { limit: async input => { key = input.key; expect(ctx.request.bodyUsed).toBe(false); return { success: true } } } })
    expect((await ctx.run()).status).toBe(200)
    expect(key).toBe(await digest('192.0.2.1'))
    expect(ctx.request.bodyUsed).toBe(true)
    expect(await ctx.event.request.text()).toBe('hello')
    expect(ctx.resolved()).toBe(true)
  })
  test('passes limiter decisions at the five-request window boundary', async () => {
    let count = 0
    const limiter: Limiter = { limit: async () => ({ success: ++count <= 5 }) }
    for (let n = 0; n < 5; n++) expect((await setup({ limiter }).run()).status).toBe(200)
    const blocked = setup({ limiter })
    expect((await blocked.run()).status).toBe(429)
    expect(blocked.request.bodyUsed).toBe(false)
    count = 0 // Simulate a provider window reset.
    expect((await setup({ limiter }).run()).status).toBe(200)
  })
  test('blocks before body consumption and resolution', async () => {
    const ctx = setup({ limiter: deny, body: 'x'.repeat(MAX_WRITE_BODY + 1) })
    const response = await ctx.run()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toContain('Try again in a minute.')
    expect(ctx.request.bodyUsed).toBe(false)
    expect(ctx.resolved()).toBe(false)
  })
  test('returns an enhanced action failure without consuming the body', async () => {
    const ctx = setup({ limiter: deny, enhanced: true })
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
      const ctx = setup({ limiter })
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
      const ctx = setup({ ...options, enhanced: true })
      const response = await ctx.run()
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ type: 'failure', status: 503 })
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
    const plain = setup()
    const response = await plain.run()
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Rate limit unavailable')
  })
  test('rejects missing or malformed production addresses', async () => {
    for (const address of ['', 'garbage', '192.0.2.1, 192.0.2.2']) {
      const ctx = setup({ address, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
    }
  })
  test('fails closed on IPv4-mapped IPv6 addresses', async () => {
    for (const address of ['::ffff:192.0.2.1', '::ffff:c000:201', '0:0:0:0:0:ffff:c633:6401']) {
      const ctx = setup({ address, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
      expect(ctx.request.bodyUsed).toBe(false)
      expect(ctx.resolved()).toBe(false)
    }
  })
  test('groups canonical IPv6 addresses by /64 prefix', async () => {
    const keys: string[] = []
    const limiter: Limiter = { limit: async input => { keys.push(input.key); return { success: true } } }
    for (const address of ['2001:0db8:0:1:0:0:0:1', '2001:db8:0:1::ffff', '2001:db8:0:2::1', '::1']) {
      expect((await setup({ address, limiter }).run()).status).toBe(200)
    }
    expect(keys[0]).toBe(await digest('ipv6-64:2001:0db8:0000:0001'))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
    expect(keys[3]).toBe(await digest('ipv6-64:0000:0000:0000:0000'))
  })
  test('local mode requires explicit flag and loopback URL and address', async () => {
    for (const opts of [{ cf: false, address: '127.0.0.1' }, { cf: false, local: 'true', address: '192.0.2.1' }]) {
      const ctx = setup({ ...opts, limiter: allow })
      expect((await ctx.run()).status).toBe(503)
    }
    let key = ''
    const ctx = setup({ local: 'true', address: '127.0.0.1', limiter: { limit: async input => { key = input.key; return { success: true } } } })
    expect((await ctx.run()).status).toBe(200)
    expect(key).toBe(await digest('local-loopback'))
    const remote = setup({ cf: false, local: 'true', address: '127.0.0.1', limiter: allow })
    remote.event.url = new URL('http://example.test/new')
    expect((await remote.run()).status).toBe(503)
  })
  test('unknown POSTs and GETs do not use the provider', async () => {
    for (const options of [{ path: '/unknown' }, { method: 'GET' }]) {
      const ctx = setup(options)
      expect((await ctx.run()).status).toBe(200)
      expect(ctx.resolved()).toBe(true)
    }
  })
  test('size limit remains enforced at boundary', async () => {
    const exact = setup({ body: 'x'.repeat(MAX_WRITE_BODY), limiter: allow })
    expect((await exact.run()).status).toBe(200)
    const over = setup({ body: 'x'.repeat(MAX_WRITE_BODY + 1), limiter: allow })
    expect((await over.run()).status).toBe(413)
  })
})
