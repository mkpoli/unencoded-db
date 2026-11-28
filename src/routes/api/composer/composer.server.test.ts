import { afterEach, expect, test } from 'bun:test'
import { composerVersion } from '$lib/composer'
import { GET } from './[version]/[...file]/+server'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

function fixture() {
  const store = new Map<string, ArrayBuffer>()
  const bucket = {
    get: async (key: string) => store.has(key) ? { arrayBuffer: async () => store.get(key)! } : null,
    put: async (key: string, value: ArrayBuffer) => { store.set(key, value) },
  }
  const call = (version: string, file: string) => GET({
    params: { version, file },
    url: new URL(`https://example.test/api/composer/${version}/${file}`),
    platform: { env: { MEDIA: bucket } },
  } as any)
  return { store, call }
}

test('serves cached composer files from R2 with immutable caching without hitting upstream', async () => {
  const { store, call } = fixture()
  const version = composerVersion('sans')
  store.set(`composer/${version}/manifest.json`, new TextEncoder().encode('{"ok":true}').buffer)
  let fetched = 0
  globalThis.fetch = (async () => { fetched++; return new Response('nope', { status: 500 }) }) as any

  const response = await call(version, 'manifest.json')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(await response.text()).toBe('{"ok":true}')
  expect(fetched).toBe(0)
})

test('fetches missing composer shards from upstream and caches them in R2', async () => {
  const { store, call } = fixture()
  const version = composerVersion('serif')
  const payload = new Uint8Array([1, 2, 3, 4])
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(`https://ids-input-composer.mkpoli.workers.dev/${version}/g/00.bin`)
    return new Response(payload, { status: 200 })
  }) as any

  const response = await call(version, 'g/00.bin')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/octet-stream')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload)
  expect(store.has(`composer/${version}/g/00.bin`)).toBe(true)
})

test('rejects unknown versions and traversal paths, and caches upstream 404 briefly without storing in R2', async () => {
  const { store, call } = fixture()
  const version = composerVersion('sans')
  expect((await call('unknown-version', 'manifest.json')).status).toBe(404)
  expect((await call(version, '../secret')).status).toBe(404)
  expect((await call(version, 'a//b')).status).toBe(404)

  globalThis.fetch = (async () => new Response(null, { status: 404 })) as any
  const missing = await call(version, 'g/ff.bin')
  expect(missing.status).toBe(404)
  expect(missing.headers.get('cache-control')).toBe('public, max-age=600')
  expect(store.size).toBe(0)
})

test('returns 502 with no-store on upstream failure', async () => {
  const { call } = fixture()
  const version = composerVersion('sans')
  globalThis.fetch = (async () => new Response(null, { status: 503 })) as any
  const response = await call(version, 'manifest.json')
  expect(response.status).toBe(502)
  expect(response.headers.get('cache-control')).toBe('no-store')
})
