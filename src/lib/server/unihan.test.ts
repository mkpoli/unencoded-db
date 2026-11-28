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
      return new Response(readFileSync(`static${url.pathname}`, 'utf8'))
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

test('irgSourcesFor fails open on missing assets without caching failures', async () => {
  let calls = 0
  const failing = {
    fetch: async () => {
      calls++
      return new Response('missing', { status: 404 })
    },
  }
  expect(await irgSourcesFor(['\u{323B0}'], { assets: failing, origin: 'https://example.test' })).toEqual({})
  expect(await irgSourcesFor(['\u{323B0}'], { assets: failing, origin: 'https://example.test' })).toEqual({})
  expect(calls).toBe(2)
})
