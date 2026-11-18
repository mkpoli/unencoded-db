import { expect, test } from 'bun:test'
import { composerDrawing, type GlyphStyle } from '$lib/composer'
import { openTestDb } from '$lib/server/testdb'
import { hashHex } from '$lib/server/image'
import { GET as glyph } from './+server'

// A record's first description, and a second one it states with a layout of its own.
const first = '⿰亻木', second = '⿱日木'
const layout = '{"0":[1,0,0,1,40,0]}'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(1,'han','${first}','a','2026','2026');
    INSERT INTO claims(entry_id,position,key,kind,value,data) VALUES
      (1,0,'ids00001','ids','${first}',NULL),
      (1,1,'ids00002','ids','${second}','{"layout":${layout}}');`)
  const drawings = new Map<string, string>()
  const bucket = {
    get: async (name: string) => drawings.has(name) ? { text: async () => drawings.get(name)! } : null,
    put: async (name: string, value: string) => { drawings.set(name, value) },
  }
  const event = (query: string) => ({ url: new URL(`https://example.test/api/glyph?${query}`), platform: { env: { DB: db, MEDIA: bucket } } }) as any
  const cache = async (name: string, style: GlyphStyle = 'sans') => drawings.set(`glyphs/${composerDrawing(style)}/${await hashHex(name)}.txt`, 'M0 0')
  return { raw, event, cache }
}

const ask = (ids: string, layout = '', style: GlyphStyle = 'sans') => `ids=${encodeURIComponent(ids)}&style=${style}&v=${encodeURIComponent(composerDrawing(style))}${layout ? `&layout=${encodeURIComponent(layout)}` : ''}`

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
  raw.exec("UPDATE entries SET hidden_at = NULL, merged_into = 2")
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
