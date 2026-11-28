import { afterEach, expect, test } from 'bun:test'
import { LOCALES } from '$lib/i18n'
import { URL_LIMIT, citedBy, indexNowUrls, notifyIndexNow } from './indexnow'
import { openTestDb } from './testdb'
import { GET } from '../../routes/[key=indexnowKey]/+server'
import { match } from '../../params/indexnowKey'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

test('URLs cover every locale of each record and source, without duplicates', () => {
  const urls = indexNowUrls({ entries: [7, 7], sources: [3] })
  expect(urls).toHaveLength(LOCALES.length * 2)
  expect(urls).toContain('https://rare.glyphatlas.org/ja/R+0007')
  expect(urls).toContain('https://rare.glyphatlas.org/zh-Hant/source/3')
})

test('the list stops at the IndexNow limit', () => {
  const entries = Array.from({ length: 3000 }, (_, i) => i + 1)
  expect(indexNowUrls({ entries })).toHaveLength(URL_LIMIT)
})

function platform(key: string | undefined, db: unknown = {}) {
  const pending: Promise<unknown>[] = []
  return { pending, platform: { env: { DB: db, INDEXNOW_KEY: key }, ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p) } } } as never }
}

test('nothing is sent without a key', () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return new Response() }) as never
  const { pending, platform: p } = platform(undefined)
  notifyIndexNow({ platform: p }, { entries: [1] })
  expect(pending).toHaveLength(0)
  expect(calls).toBe(0)
})

test('a change posts the record, its cited sources and the key location after the response', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO sources(hash, title) VALUES('h', 'T')")
  raw.exec('PRAGMA foreign_keys = OFF')
  raw.exec("INSERT INTO sightings(entry_id, first_entry, source_id, place, created_by, created_at, updated_at) VALUES(5, 5, 1, 'p', 'x', 't', 't')")
  let body: any
  globalThis.fetch = (async (_: unknown, init: RequestInit) => { body = JSON.parse(init.body as string); return new Response() }) as never
  const { pending, platform: p } = platform('abcdef123456', db)
  notifyIndexNow({ platform: p }, { entries: [5] })
  await Promise.all(pending)
  expect(body.host).toBe('rare.glyphatlas.org')
  expect(body.keyLocation).toBe('https://rare.glyphatlas.org/abcdef123456.txt')
  expect(body.urlList).toContain('https://rare.glyphatlas.org/en/R+0005')
  expect(body.urlList).toContain('https://rare.glyphatlas.org/en/source/1')
})

test('a failing request is logged, not thrown', async () => {
  globalThis.fetch = (async () => { throw new Error('offline') }) as never
  const { db } = openTestDb()
  const { pending, platform: p } = platform('abcdef123456', db)
  notifyIndexNow({ platform: p }, { sources: [1] })
  await Promise.all(pending)
})

test('the key file is served only at the configured key', async () => {
  const get = (file: string, key?: string) => GET({ params: { key: file }, platform: { env: { INDEXNOW_KEY: key } } } as never)
  const ok = await get('abcdef123456.txt', 'abcdef123456')
  expect(await ok.text()).toBe('abcdef123456')
  expect(ok.headers.get('content-type')).toContain('text/plain')
  expect(() => get('other-key-1234.txt', 'abcdef123456')).toThrow(expect.objectContaining({ status: 404 }))
  expect(() => get('abcdef123456.txt')).toThrow(expect.objectContaining({ status: 404 }))
})

test('the key matcher leaves short record codes and other paths alone', () => {
  expect(match('abcdef123456.txt')).toBe(true)
  for (const code of ['RN', 'en', 'abcdef123456', 'short.txt', 'a/b.txt']) expect(match(code)).toBe(false)
})

test('the sources a sighting cited before a write are named, its own and its vias', () => {
  expect(citedBy({ source_id: 7, vias: [{ id: 9 }, { id: 11 }] })).toEqual([7, 9, 11])
  expect(citedBy({ source_id: null, vias: [] })).toEqual([])
})
