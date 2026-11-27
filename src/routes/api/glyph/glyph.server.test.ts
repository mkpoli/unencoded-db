import { afterEach, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { composerDrawing, type GlyphStyle } from '$lib/composer'
import { openTestDb } from '$lib/server/testdb'
import { hashHex } from '$lib/server/image'
import { GET as glyph } from './+server'

// A record's first description, and a second one it states with a layout of its own.
const first = '⿰亻木', second = '⿱日木'
const layout = '{"0":[1,0,0,1,40,0]}'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(2,'han','${first}','a','2026','2026');
    INSERT INTO claims(entry_id,position,key,kind,value,data) VALUES
      (2,0,'ids00001','ids','${first}',NULL),
      (2,1,'ids00002','ids','${second}','{"layout":${layout}}');`)
  const drawings = new Map<string, string>()
  const bucket = {
    get: async (name: string) => drawings.has(name) ? { text: async () => drawings.get(name)! } : null,
    put: async (name: string, value: string) => { drawings.set(name, value) },
  }
  const event = (query: string) => ({ url: new URL(`https://example.test/api/glyph?${query}`), platform: { env: { DB: db, MEDIA: bucket } } }) as any
  const cache = async (name: string, style: GlyphStyle = 'sans') => drawings.set(`glyphs/${composerDrawing(style, name.includes('\n'))}/${await hashHex(name)}.txt`, 'M0 0')
  return { raw, event, cache }
}

const ask = (ids: string, layout = '', style: GlyphStyle = 'sans') => `ids=${encodeURIComponent(ids)}&style=${style}&v=${encodeURIComponent(composerDrawing(style, Boolean(layout)))}${layout ? `&layout=${encodeURIComponent(layout)}` : ''}`

test('the first description of a visible record draws', async () => {
  const { event, cache } = fixture()
  await cache(first)
  const response = await glyph(event(ask(first)))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ d: 'M0 0' })
})

test('another description the record states draws with its own layout', async () => {
  const { event, cache } = fixture()
  await cache(`${second}\n${layout}`)
  const response = await glyph(event(ask(second, layout)))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ d: 'M0 0' })
  // The description alone is another drawing, and the record stores none without its layout.
  expect((await glyph(event(ask(second)))).status).toBe(404)
})

test('a layout the record does not store for the description does not draw', async () => {
  const { event, cache } = fixture()
  await cache(second)
  expect((await glyph(event(ask(second, '{"0":[1,0,0,1,-40,0]}')))).status).toBe(404)
})

test('a description no visible record states does not draw', async () => {
  const { event, raw, cache } = fixture()
  await cache('⿰木木')
  expect((await glyph(event(ask('⿰木木')))).status).toBe(404)
  raw.exec("UPDATE entries SET hidden_at = '2026'")
  expect((await glyph(event(ask(first)))).status).toBe(404)
  raw.exec("INSERT INTO entries(id,script,created_by,created_at,updated_at) VALUES(1,'han','a','2026','2026'); UPDATE entries SET hidden_at = NULL, merged_into = 1 WHERE id = 2")
  expect((await glyph(event(ask(first)))).status).toBe(404)
})

test('each face serves only its effective layout on a visible claim', async () => {
  const { event, cache, raw } = fixture()
  const serif = '{"1":[1,0,0,1,0,30]}'
  raw.prepare("UPDATE claims SET data = ? WHERE value = ?").run(
    `{"layout":{"shared":${layout},"faces":{"sans":{},"serif":${serif}}}}`, second,
  )
  await cache(second)
  await cache(`${second}\n${serif}`, 'serif')
  await cache(`${second}\n${layout}`, 'pen-writing')
  expect((await glyph(event(ask(second)))).status).toBe(200)
  expect((await glyph(event(ask(second, layout)))).status).toBe(404)
  expect((await glyph(event(ask(second, serif, 'serif')))).status).toBe(200)
  expect((await glyph(event(ask(second, layout, 'serif')))).status).toBe(404)
  expect((await glyph(event(ask(second, layout, 'pen-writing')))).status).toBe(200)
})

test('a temporarily unavailable object store returns a retryable status', async () => {
  const { event } = fixture()
  const request = event(ask(first))
  request.platform.env.MEDIA.get = async () => { throw new Error('temporarily unavailable') }
  const response = await glyph(request)
  expect(response.status).toBe(503)
  expect(response.headers.get('cache-control')).toBe('no-store')
})

// A record whose description is drawn from a file of the build alone, so no export is read. The
// file holds no outlines unless a test says otherwise.
function bundledFixture(assets: () => Promise<Response> = async () => new Response(gzipSync('{}'))) {
  const { raw, event } = fixture()
  raw.exec(`INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(3,'bopomofo','ㄍ','a','2026','2026');
    INSERT INTO claims(entry_id,position,key,kind,value,data) VALUES(3,0,'ids00003','ids','ㄍ',NULL);`)
  const request = event(ask('ㄍ'))
  const stored: string[] = []
  const put = request.platform.env.MEDIA.put
  request.platform.env.MEDIA.put = async (name: string, value: string) => { stored.push(name); await put(name, value) }
  request.platform.env.ASSETS = { fetch: assets }
  return { request, stored }
}

// The edge cache of the test: what was put, by address.
const scope = globalThis as unknown as { caches?: unknown }
const edge = () => {
  const kept = new Map<string, Response>()
  scope.caches = { default: { put: async (request: Request, response: Response) => { kept.set(request.url, response) } } }
  return kept
}
afterEach(() => { delete scope.caches })

test('a description the composer cannot draw is remembered at the edge for a short while, and never stored', async () => {
  const kept = edge()
  const { request, stored } = bundledFixture()
  const response = await glyph(request)
  expect(response.status).toBe(404)
  expect(response.headers.get('cache-control')).toBe('public, max-age=600')
  expect(await response.json()).toEqual({ undrawable: true })
  expect([...kept.keys()]).toEqual([request.url.href])
  const remembered = kept.get(request.url.href)!
  expect(remembered.status).toBe(404)
  expect(remembered.headers.get('cache-control')).toBe('public, max-age=600')
  expect(await remembered.json()).toEqual({ undrawable: true })
  expect(stored).toEqual([])
})

test('an edge cache that cannot be written still answers', async () => {
  scope.caches = { default: { put: async () => { throw new Error('unavailable') } } }
  const { request } = bundledFixture()
  expect((await glyph(request)).status).toBe(404)
})

test('storage that fails beside a drawing is retryable and never remembered', async () => {
  const kept = edge()
  // The composer draws on without the file and reports a missing part; the failed read decides.
  for (const assets of [async () => new Response(null, { status: 503 }), async () => { throw new Error('unavailable') }]) {
    const { request, stored } = bundledFixture(assets)
    const response = await glyph(request)
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(stored).toEqual([])
  }
  expect(kept.size).toBe(0)
})

test('an answer that is no drawing and no failure to draw is not remembered', async () => {
  const kept = edge()
  const { event, cache } = fixture()
  await cache('⿰木木')
  const refused = await glyph(event(ask('⿰木木')))
  expect(refused.status).toBe(404)
  expect(refused.headers.get('cache-control')).toBeNull()
  await cache(first)
  const drawn = await glyph(event(ask(first)))
  expect(drawn.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(kept.size).toBe(0)
})
