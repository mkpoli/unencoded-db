import { describe, expect, test } from 'bun:test'
import { MAX_IMAGE_BYTES } from './images'
import { limitWriteBody, MAX_NEW_BODY, MAX_WRITE_BODY, writeBodyLimit } from './body-limit'

describe('write body limit', () => {
  test('rejects an advertised oversized body', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'small', headers: { 'content-length': '100' } })
    expect(await limitWriteBody(req, 10)).toBeNull()
  })
  test('rejects a streamed body even with a misleading length', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: '123456', headers: { 'content-length': '1' } })
    expect(await limitWriteBody(req, 5)).toBeNull()
  })
  test('accepts maximum-length text fields', async () => {
    const values = { script: 80, ids: 200, description: 5000, place: 500, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    const body = new URLSearchParams(Object.fromEntries(Object.entries(values).map(([key, length]) => [key, '字'.repeat(length)])))
    for (let i = 0; i < 10; i++) {
      body.append('comparison_character', '字'.repeat(200))
      body.append('comparison_relationship', 'not_variant')
      body.append('comparison_differences', '字'.repeat(2000))
      body.append('comparison_evidence', '字'.repeat(2000))
    }
    const req = new Request('https://example.test/', { method: 'POST', body })
    expect(new TextEncoder().encode(body.toString()).length).toBeLessThan(MAX_WRITE_BODY)
    const result = await limitWriteBody(req)
    expect(await result!.text()).toBe(body.toString())
  })
  test('rejects a body over the default limit', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'x'.repeat(MAX_WRITE_BODY + 1) })
    expect(await limitWriteBody(req)).toBeNull()
  })
  test('preserves an accepted body', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'hello' })
    const result = await limitWriteBody(req, 5)
    expect(await result!.text()).toBe('hello')
    expect(result!.headers.get('content-length')).toBe('5')
  })
})

describe('route body limits', () => {
  test('allows an 8 MiB image on the localized new page only', () => {
    expect(MAX_NEW_BODY).toBe(MAX_IMAGE_BYTES + 64 * 1024)
    for (const path of ['/en/new', '/ja/new', '/zh-Hans/new', '/zh-Hant/new', '/ko/new', '/vi/new', '/ja/new/', '/%6a%61/new']) {
      expect(writeBodyLimit(path), path).toBe(MAX_NEW_BODY)
    }
    for (const path of ['/', '/new', '/en', '/ja/entry/1', '/en/entry/1/image', '/ja/not-new', '/newer']) {
      expect(writeBodyLimit(path), path).toBe(MAX_WRITE_BODY)
    }
  })
  test('accepts a body between the small and image limits with the larger limit', async () => {
    const body = 'x'.repeat(MAX_WRITE_BODY + 1)
    const req = new Request('https://example.test/ja/new', { method: 'POST', body })
    const result = await limitWriteBody(req, MAX_NEW_BODY)
    expect(result).not.toBeNull()
    expect((await result!.arrayBuffer()).byteLength).toBe(MAX_WRITE_BODY + 1)
  })
  test('rejects a body over the image limit', async () => {
    const req = new Request('https://example.test/ja/new', { method: 'POST', body: 'x'.repeat(MAX_NEW_BODY + 1) })
    expect(await limitWriteBody(req, MAX_NEW_BODY)).toBeNull()
  })
})
