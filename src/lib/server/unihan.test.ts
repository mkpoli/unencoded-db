import { beforeEach, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { clearUnihanCache, irgSourcesFor } from './unihan'

beforeEach(() => clearUnihanCache())

test('irgSourcesFor reads Unihan blocks through ASSETS, caches blocks, and skips non-ideographs', async () => {
  const fetched: string[] = []
  const assets = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      fetched.push(url.pathname)
      return new Response(readFileSync(`static${url.pathname}`, 'utf8'), { headers: { 'content-type': 'text/tab-separated-values' } })
    },
  }
  const first = await irgSourcesFor(['\u{30000}', '\u{30002}', 'a', 'ab'], { assets, origin: 'https://example.test' })
  expect(first).toEqual({
    '\u{30000}': ['UK-02764'],
    '\u{30002}': ['UTC-00969'],
  })
  expect(fetched).toEqual(['/unihan/300.tsv'])

  // Second read of the same block hits the isolate cache.
  const second = await irgSourcesFor(['\u{30003}'], { assets, origin: 'https://example.test' })
  expect(second['\u{30003}']).toEqual(['GHZR-10110.18'])
  expect(fetched).toEqual(['/unihan/300.tsv'])
})

test('irgSourcesFor falls back to event.fetch when ASSETS is absent and coalesces concurrent reads', async () => {
  let calls = 0
  const localFetch = (async (input: RequestInfo | URL) => {
    calls++
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
    await Bun.sleep(10)
    return new Response(readFileSync(`static${path}`, 'utf8'))
  }) as typeof fetch

  const [a, b] = await Promise.all([
    irgSourcesFor(['\u{323B0}'], { fetch: localFetch }),
    irgSourcesFor(['\u{323B5}'], { fetch: localFetch }),
  ])
  expect(a).toEqual({ '\u{323B0}': ['UTC-03207'] })
  expect(b).toEqual({ '\u{323B5}': ['GZ-0381601'] })
  expect(calls).toBe(1)
})

test('irgSourcesFor rejects 404s and 200 HTML fallback pages without caching failures', async () => {
  let calls = 0
  const htmlFallback = {
    fetch: async () => {
      calls++
      return new Response('<!doctype html><html><body>Not found</body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
  }
  expect(await irgSourcesFor(['\u{323B0}'], { assets: htmlFallback, origin: 'https://example.test' })).toEqual({})
  expect(await irgSourcesFor(['\u{323B0}'], { assets: htmlFallback, origin: 'https://example.test' })).toEqual({})
  expect(calls).toBe(2)

  let notFoundCalls = 0
  const failing = {
    fetch: async () => {
      notFoundCalls++
      return new Response('missing', { status: 404 })
    },
  }
  expect(await irgSourcesFor(['\u{31350}'], { assets: failing, origin: 'https://example.test' })).toEqual({})
  expect(await irgSourcesFor(['\u{31350}'], { assets: failing, origin: 'https://example.test' })).toEqual({})
  expect(notFoundCalls).toBe(2)
})
