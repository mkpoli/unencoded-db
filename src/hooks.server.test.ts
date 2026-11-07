import { describe, expect, test } from 'bun:test'
import { handle } from './hooks.server'
import { MAX_NEW_BODY, MAX_WRITE_BODY } from './lib/server/body-limit'
import { MAX_IMAGE_BYTES } from './lib/server/images'
import { PNG_BYTES, imageFile } from './test-support'

function event(pathname: string, body: string) {
  const request = new Request(`https://example.test${pathname}`, { method: 'POST', body })
  return { request, url: new URL(request.url), route: { id: pathname } } as any
}

describe('POST body limit routing', () => {
  test('keeps the small limit on other POST routes', async () => {
    let resolved = false
    const response = await handle({
      event: event('/entry/1', 'x'.repeat(MAX_WRITE_BODY + 1)),
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(413)
    expect(resolved).toBe(false)
  })

  test('uses the larger limit on POST /new', async () => {
    let resolved = false
    const e = event('/new', 'x'.repeat(MAX_WRITE_BODY + 1))
    const response = await handle({
      event: e,
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(200)
    expect(resolved).toBe(true)
    expect(e.request.headers.get('content-length')).toBe(String(MAX_WRITE_BODY + 1))
  })

  test('rejects an oversized /new body before parsing or resolving', async () => {
    let resolved = false
    const e = event('/new', 'x'.repeat(MAX_NEW_BODY + 1))
    e.request.formData = () => { throw new Error('form parsed') }
    const response = await handle({
      event: e,
      resolve: async () => { resolved = true; return new Response('ok') },
    } as any)
    expect(response.status).toBe(413)
    expect(resolved).toBe(false)
  })
})

describe('multipart POST /new', () => {
  test('reconstructs an 8 MiB multipart body for the form parser', async () => {
    const bytes = new Uint8Array(MAX_IMAGE_BYTES)
    bytes.set(PNG_BYTES)
    const form = new FormData()
    form.set('script', 'Han')
    form.set('place', 'Book')
    form.set('image', imageFile(bytes))
    const request = new Request('https://example.test/new', { method: 'POST', body: form })

    let kept: Request | undefined
    const response = await handle({
      event: { request, url: new URL(request.url) } as any,
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
