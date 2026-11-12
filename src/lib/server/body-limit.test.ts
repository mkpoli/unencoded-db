import { describe, expect, test } from 'bun:test'
import { handle } from '../../hooks.server'
import { MAX_IMAGE, MAX_THUMB } from './image'
import { limitWriteBody, MAX_WRITE_BODY } from './body-limit'
import { guardWrite, writeLimitFor } from './guard'

function streamed(chunks: Uint8Array[], length?: string) {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.close()
    },
    cancel() { cancelled = true },
  })
  const request = new Request('https://example.test/en/new', {
    method: 'POST', body, headers: length === undefined ? {} : { 'content-length': length },
    duplex: 'half',
  } as RequestInit)
  return { request, cancelled: () => cancelled }
}

async function runHook(request: Request, resolve: (event: any) => Promise<Response>, overrides: Record<string, unknown> = {}) {
  const event = {
    request, url: new URL(request.url), cookies: { get: () => undefined }, locals: {},
    route: { id: '/[locale]/new' }, platform: { env: {} }, ...overrides,
  }
  return handle({ event, resolve } as any)
}

describe('write body limit', () => {
  test('rejects an advertised oversized body before reading it', async () => {
    const body = streamed([new Uint8Array(1)], String(MAX_WRITE_BODY + 1))
    let resolved = false
    const response = await runHook(body.request, async () => { resolved = true; return new Response() })
    expect(response.status).toBe(413)
    expect(resolved).toBe(false)
    expect(body.cancelled()).toBe(true)
  })

  for (const length of [undefined, '1', 'invalid']) {
    test(`rejects oversized streamed body with content-length ${length}`, async () => {
      const body = streamed([new Uint8Array(MAX_WRITE_BODY), new Uint8Array(1), new Uint8Array(1)], length)
      let resolved = false
      const response = await runHook(body.request, async () => { resolved = true; return new Response() })
      expect(response.status).toBe(413)
      expect(resolved).toBe(false)
      expect(body.cancelled()).toBe(true)
    })
  }

  test('accepts exactly the limit and corrects an inaccurate length', async () => {
    const original = streamed([new Uint8Array(MAX_WRITE_BODY)], '1').request
    const limited = await limitWriteBody(original)
    expect(limited).not.toBeNull()
    expect(limited!.headers.get('content-length')).toBe(String(MAX_WRITE_BODY))
    expect((await limited!.arrayBuffer()).byteLength).toBe(MAX_WRITE_BODY)
  })

  test('preserves multipart files at both image limits', async () => {
    const form = new FormData()
    form.set('image', new File([new Uint8Array(MAX_IMAGE)], 'image.png', { type: 'image/png' }))
    form.set('thumb', new File([new Uint8Array(MAX_THUMB)], 'thumb.png', { type: 'image/png' }))
    form.set('place', 'A book')
    const request = new Request('https://example.test/en/new', { method: 'POST', body: form })
    const response = await runHook(request, async (event) => {
      const parsed = await event.request.formData()
      expect(parsed.get('place')).toBe('A book')
      expect((parsed.get('image') as File).size).toBe(MAX_IMAGE)
      expect((parsed.get('thumb') as File).size).toBe(MAX_THUMB)
      expect((parsed.get('image') as File).type).toBe('image/png')
      return new Response('ok')
    })
    expect(response.status).toBe(200)
  })

  test('limits a matched action once before reading the body', async () => {
    let calls = 0
    const body = streamed([new Uint8Array(5)])
    const response = await runHook(body.request, async event => {
      await guardWrite(event, 'ADDS')
      return new Response('ok')
    }, { platform: { env: { ADDS: { limit: async () => { calls++; return { success: true } } } } } })
    expect(response.status).toBe(200)
    expect(calls).toBe(1)
  })

  test('rejects rate-limited requests before reading the body', async () => {
    const request = streamed([new Uint8Array(1)]).request
    await expect(runHook(request, async () => new Response(), { platform: { env: { ADDS: { limit: async () => ({ success: false }) } } } })).rejects.toMatchObject({ status: 429 })
    expect(request.bodyUsed).toBe(false)
  })

  test('rejects banned sessions before reading the body', async () => {
    const body = streamed([new Uint8Array(1)])
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ id: '1', name: 'x', atlas_sub: null, role: 'member', banned_at: 'now', created_at: new Date().toISOString() }) }) }) }
    await expect(runHook(body.request, async () => new Response(), { cookies: { get: () => 'token' }, platform: { env: { DB: db } } })).rejects.toMatchObject({ status: 403 })
    expect(body.request.bodyUsed).toBe(false)
  })

  test('rejects unknown actions before reading the body', async () => {
    const body = streamed([new Uint8Array(1)])
    const response = await runHook(body.request, async () => { throw new Error('unexpected resolve') }, { route: { id: '/unknown' } })
    expect(response.status).toBe(404)
    expect(body.request.bodyUsed).toBe(false)
  })

  test('maps each existing guarded action to its limiter', () => {
    const routes: [string, string, 'ADDS' | 'EDITS'][] = [
      ['/[locale]/new', '', 'ADDS'], ['/[locale]/batch', '', 'ADDS'], ['/[locale]/entry/[id]/sighting/new', '', 'ADDS'],
      ['/[locale]/entry/[id]', '?/edit', 'EDITS'], ['/[locale]/me', '', 'EDITS'],
      ['/[locale]/entry/[id]/report', '', 'EDITS'], ['/[locale]/entry/[id]/sighting/[sighting]/edit', '', 'EDITS'],
      ['/[locale]/entry/[id]/history', '?/restore', 'EDITS'],
      ...['restoreEntry', 'restoreSighting', 'hide', 'unhide', 'resolve'].map(action => ['/[locale]/moderate', `?/${action}`, 'EDITS'] as [string, string, 'ADDS' | 'EDITS']),
    ]
    for (const [id, search, expected] of routes) {
      const request = new Request(`https://example.test/en${search}`, { method: 'POST' })
      expect(writeLimitFor({ request, url: new URL(request.url), route: { id } } as any)).toBe(expected)
    }
    const request = new Request('https://example.test/en?/bogus&/sighting', { method: 'POST' })
    expect(writeLimitFor({ request, url: new URL(request.url), route: { id: '/[locale]/entry/[id]' } } as any)).toBeNull()
  })

  test('pause allows only authorized, rate-limited moderation actions through the hook', async () => {
    const db = (role: string, banned = false) => ({ prepare: () => ({ bind: () => ({ first: async () => ({ id: '1', name: 'x', atlas_sub: null, role, banned_at: banned ? 'now' : null, created_at: new Date().toISOString() }) }) }) })
    const request = (path: string) => new Request(`https://example.test/en/${path}`, { method: 'POST', body: 'x' })
    const options = (role: string, success = true, banned = false) => ({ route: { id: '/[locale]/moderate' }, cookies: { get: () => 'token' }, platform: { env: { DB: db(role, banned), WRITES_PAUSED: '1', EDITS: { limit: async () => ({ success }) } } } })
    for (const action of ['hide', 'unhide', 'resolve', 'restoreEntry', 'restoreSighting']) {
      let calls = 0
      const o = options('moderator')
      o.platform.env.EDITS.limit = async () => { calls++; return { success: true } }
      const response = await runHook(request(`moderate?/${action}`), async event => { await guardWrite(event, 'EDITS', true); return new Response() }, o)
      expect(response.status).toBe(200)
      expect(calls).toBe(1)
    }
    for (const o of [options('member'), options('moderator', true, true)]) {
      await expect(runHook(request('moderate?/hide'), async () => new Response(), o)).rejects.toMatchObject({ status: 403 })
    }
    await expect(runHook(request('moderate?/hide'), async () => new Response(), options('moderator', false))).rejects.toMatchObject({ status: 429 })
    expect((await runHook(request('moderate?/unknown'), async () => new Response(), options('moderator'))).status).toBe(404)
    await expect(runHook(request('new'), async () => new Response(), { platform: { env: { WRITES_PAUSED: '1' } } })).rejects.toMatchObject({ status: 503 })
    await expect(runHook(request('entry/1?/edit'), async () => new Response(), { route: { id: '/[locale]/entry/[id]' }, platform: { env: { WRITES_PAUSED: '1' } } })).rejects.toMatchObject({ status: 503 })
  })

  test('leaves GET requests untouched', async () => {
    const request = new Request('https://example.test/en/new')
    const response = await runHook(request, async (event) => {
      expect(event.request).toBe(request)
      return new Response('ok')
    })
    expect(response.status).toBe(200)
  })
})
