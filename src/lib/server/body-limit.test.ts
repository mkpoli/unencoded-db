import { describe, expect, test } from 'bun:test'
import { limitWriteBody, MAX_WRITE_BODY } from './body-limit'

describe('write body limit', () => {
  test('rejects an advertised oversized body', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'small', headers: { 'content-length': '100' } })
    expect(await limitWriteBody(req, 10)).toBeNull()
  })
  test('rejects a streamed body even with a misleading length', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: '123456', headers: { 'content-length': '1' } })
    expect(await limitWriteBody(req, 5)).toBeNull()
  })
  test('accepts maximum-length URL-encoded text fields', async () => {
    const values = { script: 80, ids: 200, description: 5000, place: 500, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    const body = new URLSearchParams(Object.fromEntries(Object.entries(values).map(([key, length]) => [key, '字'.repeat(length)])))
    body.set('url', `https://example.test/${'字'.repeat(979)}`)
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
