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

describe('html lang', () => {
  const template = '<!doctype html><html lang="%lang%"><head></head><body>%lang%</body></html>'

  async function render(path: string) {
    const event = { request: new Request(`https://example.test${path}`), url: new URL(`https://example.test${path}`) } as any
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
