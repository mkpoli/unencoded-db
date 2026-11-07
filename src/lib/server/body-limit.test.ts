import { describe, expect, test } from 'bun:test'
import { limitWriteBody } from './body-limit'

describe('write body limit', () => {
  test('rejects an advertised oversized body', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'small', headers: { 'content-length': '100' } })
    expect(await limitWriteBody(req, 10)).toBeNull()
  })
  test('rejects a streamed body even with a misleading length', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: '123456', headers: { 'content-length': '1' } })
    expect(await limitWriteBody(req, 5)).toBeNull()
  })
  test('preserves an accepted body', async () => {
    const req = new Request('https://example.test/', { method: 'POST', body: 'hello' })
    const result = await limitWriteBody(req, 5)
    expect(await result!.text()).toBe('hello')
    expect(result!.headers.get('content-length')).toBe('5')
  })
})
