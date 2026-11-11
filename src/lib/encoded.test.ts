import { afterEach, expect, mock, test } from 'bun:test'
import { encodedMatch } from './encoded'

const originalFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = originalFetch })

test('retries a failed table request and shares the successful result', async () => {
  const fetchTable = mock()
    .mockRejectedValueOnce(new Error('network failure'))
    .mockResolvedValueOnce(new Response('字\t⿰女子\n', { status: 503, headers: { 'content-encoding': 'identity' } }))
    .mockResolvedValueOnce(new Response('not gzip'))
    .mockResolvedValueOnce(new Response(Bun.gzipSync('字\t⿰女子\n')))
  globalThis.fetch = fetchTable as unknown as typeof fetch

  await expect(encodedMatch('⿰女子')).rejects.toThrow('network failure')
  await expect(encodedMatch('⿰女子')).rejects.toThrow('503')
  await expect(encodedMatch('⿰女子')).rejects.toBeInstanceOf(TypeError)
  const [first, second] = await Promise.all([encodedMatch('⿰女子'), encodedMatch('⿰女子')])
  expect(first).toBe('字')
  expect(second).toBe('字')
  expect(await encodedMatch('⿰女子')).toBe('字')
  expect(fetchTable).toHaveBeenCalledTimes(4)
})
