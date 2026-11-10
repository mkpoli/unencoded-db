import { describe, expect, test } from 'bun:test'
import { MAX_IMAGE_BYTES } from './images'
import { limitWriteBody, MAX_IMAGE_BODY, MAX_WRITE_BODY, writeBodyLimit } from './body-limit'

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
    for (let i = 0; i < 10; i++) { body.append('comparison_variant', '字'); body.append('comparison_erroneous', '字') }
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
  test('allows a 16 MiB image on the routes with an image field', () => {
    for (const route of [
      '/[locale]/new', '/[locale]/batch', '/[locale]/entry/[id]', '/[locale]/entry/[id]/edit',
    ]) {
      expect(writeBodyLimit(route), route).toBe(MAX_IMAGE_BODY)
    }
    for (const route of [
      null, undefined, '/[locale]', '/[locale]/entry/[id]/image', '/[locale]/entry/[id]/report',
      '/[locale]/entry/[id]/history', '/[locale]/moderate', '[locale]/new',
    ]) {
      expect(writeBodyLimit(route), String(route)).toBe(MAX_WRITE_BODY)
    }
  })
  test('accepts a body between the small and image limits with the larger limit', async () => {
    const body = 'x'.repeat(MAX_WRITE_BODY + 1)
    const req = new Request('https://example.test/ja/new', { method: 'POST', body })
    const result = await limitWriteBody(req, MAX_IMAGE_BODY)
    expect(result).not.toBeNull()
    expect((await result!.arrayBuffer()).byteLength).toBe(MAX_WRITE_BODY + 1)
  })
  test('rejects a body over the image limit', async () => {
    const req = new Request('https://example.test/ja/new', { method: 'POST', body: 'x'.repeat(MAX_IMAGE_BODY + 1) })
    expect(await limitWriteBody(req, MAX_IMAGE_BODY)).toBeNull()
  })
})
