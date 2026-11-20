import { expect, test } from 'bun:test'
import { encode } from 'fast-png'
import { openTestDb } from '$lib/server/testdb'
import { getSourceArtwork, getVisibleSource } from '$lib/server/entries'
import { lines, panelView, recordArtwork } from '$lib/server/social-card'
import { GET } from './[locale]/[kind]/[id]/card.png/+server'
import { copyCardSpecimen, copyPage } from '$lib/server/digitized-copies'
import { GET as copyCard } from './[locale]/sources/copy/[slug]/card.png/+server'

test('card requests reject hidden or merged records and sources without visible evidence', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at, merged_into) VALUES
      (1, 'han', 'p', '2026', '2026', null, null),
      (2, 'han', 'p', '2026', '2026', 'hidden', null),
      (3, 'han', 'p', '2026', '2026', null, 1);
    INSERT INTO sources(id, hash, title) VALUES (1, 'book', 'A book'), (2, 'thread', 'A thread');
    INSERT INTO sightings(id, entry_id, first_entry, source_id, place, created_by, created_at, updated_at, hidden_at) VALUES
      (1, 2, 2, 1, 'Book', 'p', '2026', '2026', null),
      (2, 1, 1, null, 'Via a thread', 'p', '2026', '2026', null);
    INSERT INTO sighting_vias(sighting_id, position, source_id) VALUES (2, 0, 2);
    INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) VALUES
      (1, 0, 'hidden.png', 'image/png', 1, 1, 'hidden-thumb.png'),
      (2, 0, 'public.png', 'image/png', 1, 1, 'public-thumb.png');`)
  const card = (kind: string, id: number) => Promise.resolve(GET({
    params: { locale: 'en', kind, id: String(id) }, platform: { env: { DB: db } },
  } as Parameters<typeof GET>[0]))

  await expect(card('entry', 2)).rejects.toMatchObject({ status: 404 })
  await expect(card('entry', 3)).rejects.toMatchObject({ status: 404 })
  await expect(card('source', 1)).rejects.toMatchObject({ status: 404 })
  expect(await getVisibleSource(db, 2)).toMatchObject({ title: 'A thread' })
  expect(await getSourceArtwork(db, 1)).toBeNull()
  expect(await getSourceArtwork(db, 2)).toBeNull()
  raw.exec('UPDATE sightings SET source_id = 2 WHERE id = 2')
  expect(await getSourceArtwork(db, 2)).toEqual({ image_key: 'public.png', thumb_key: 'public-thumb.png', image_w: 1, image_h: 1, box: null })
})

test('a copy preview uses public evidence from that copy and checks visibility before rendering', async () => {
  const { raw, db } = openTestDb()
  const slug = 'ntcu-848'
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES
      (1, 'han', '永', 'p', '2026', '2026'), (2, 'han', '木', 'p', '2026', '2026');
    INSERT INTO sources(id, hash, url) VALUES
      (1, 'page', 'https://ip194097.ntcu.edu.tw/memory/TGB/thak.asp?id=848&page=7');
    INSERT INTO sightings(id, entry_id, first_entry, source_id, place, created_by, created_at, updated_at) VALUES
      (1, 1, 1, NULL, 'Via the book', 'p', '2026', '2026'),
      (2, 2, 2, 1, 'In the book', 'p', '2026', '2026');
    INSERT INTO sighting_vias(sighting_id, position, source_id) VALUES (1, 0, 1);
    INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) VALUES
      (1, 0, 'other.png', 'image/png', 1, 1, 'shared-thumb.png'),
      (2, 0, 'book.png', 'image/png', 1, 1, 'shared-thumb.png');`)
  expect(await copyCardSpecimen(db, slug)).toMatchObject({ title: '彙音字典', collection: 'NTCU', entry_id: 2, thumb_key: 'shared-thumb.png', image_key: 'book.png' })
  const initialVersion = (await copyPage(db, slug, 0))!.cardVersion
  raw.exec("DELETE FROM sighting_media WHERE sighting_id = 2; UPDATE entries SET ids = NULL WHERE id = 2")
  expect(await copyCardSpecimen(db, slug)).toMatchObject({ entry_id: 1, ids: '永', image_key: null })
  expect((await copyPage(db, slug, 0))!.cardVersion).not.toBe(initialVersion)
  raw.exec("UPDATE sightings SET hidden_at = 'now' WHERE id = 2")
  expect(await copyCardSpecimen(db, slug)).toMatchObject({ entry_id: 1, ids: '永', image_key: null, thumb_key: null })
  raw.exec('UPDATE entries SET merged_into = 2 WHERE id = 1')
  for (const name of [slug, 'unknown-copy']) {
    await expect(Promise.resolve(copyCard({
      params: { locale: 'en', slug: name }, platform: { env: { DB: db } },
    } as Parameters<typeof copyCard>[0]))).rejects.toMatchObject({ status: 404 })
  }
})

test('record artwork draws every style beside the evidence panel', async () => {
  const path = 'M100 100h800v800H100z'
  const png = encode({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
  const cover = { size: png.byteLength, arrayBuffer: async () => png.slice().buffer } as R2ObjectBody
  const bucket = {
    get: async (key: string) => key === 'cover.png' ? cover : { text: async () => path } as R2ObjectBody,
    put: async () => { throw new Error('The drawing is already cached') },
  }
  const picture = { image_key: 'page.png', thumb_key: 'cover.png', image_w: 1, image_h: 1, box: null }
  const context = { origin: 'https://rare.glyphatlas.org', locale: 'en', assets: { fetch: async () => new Response(null, { status: 404 }) } }
  const combined = await recordArtwork(bucket, { ids: '永' }, picture, context)
  expect(combined.glyphs.map(glyph => glyph.name)).toEqual(['Sans', 'Serif', 'Fangsong', 'Regular', 'Pen'])
  expect(combined.glyphs[0].drawing).toBe(path)
  expect(combined.evidence).toContain('preserveAspectRatio="xMidYMid slice"')
  expect(await recordArtwork(bucket, { ids: null }, picture, context)).toMatchObject({ glyphs: [] })
  expect(await recordArtwork(bucket, { ids: '永' }, null, context)).toMatchObject({ evidence: '' })
})

test('the evidence panel keeps a marked character in view with its surroundings', () => {
  // A page without a mark is cut to the panel's shape around its centre.
  const view = panelView(700, 1100, null)
  ;[0, (1100 - 700 * 554 / 382) / 2, 700, 700 * 554 / 382].forEach((value, index) => expect(view[index]).toBeCloseTo(value))
  // A mark near the corner stays inside the crop, which stays inside the page.
  const [x, y, width, tall] = panelView(2000, 3000, [1900, 2900, 60, 60])
  expect(x + width).toBeLessThanOrEqual(2000)
  expect(y + tall).toBeLessThanOrEqual(3000)
  expect(x).toBeLessThanOrEqual(1900)
  expect(y).toBeLessThanOrEqual(2900)
  expect(tall).toBeCloseTo(240 / 382 * 554)
})

test('titles break between words, evenly, and keep the site name whole', () => {
  expect(lines('このページは存在しません。', 10, 3)).toEqual(['このページは', '存在しません。'])
  expect(lines('Glyph Atlasアカウント', 10, 3)).toEqual(['Glyph Atlas', 'アカウント'])
  expect(lines('Giới thiệu Tuyển tập chữ quý', 10, 3, ['Tuyển tập chữ quý'])).toEqual(['Giới thiệu', 'Tuyển tập chữ quý'])
  expect(lines('Tuyển tập chữ quý', 10, 3)).toEqual(['Tuyển tập chữ quý'])
  expect(lines('R+06C6', 3, 1)).toEqual(['R+0…'])
  expect(lines('合併字學集韻合併字學集韻', 5, 2)).toEqual(['合併字學集', '韻合併字…'])
})

test('cards are looked up in the cache only after visibility, under an address made from their content', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, ids, created_by, created_at, updated_at, hidden_at) VALUES
      (1, 'han', '永', 'p', '2026', '2026', null),
      (2, 'han', '永', 'p', '2026', '2026', 'hidden');`)
  const looked: string[] = []
  const cached = new Response('png', { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } })
  const globals = globalThis as unknown as { caches?: unknown }
  const original = globals.caches
  globals.caches = { default: { match: async (request: Request) => (looked.push(request.url), cached.clone()) } }
  try {
    const card = (id: number, search = '') => Promise.resolve(GET({
      params: { locale: 'en', kind: 'entry', id: String(id) }, url: new URL(`https://rare.glyphatlas.org/en/entry/${id}/card.png${search}`), platform: { env: { DB: db } },
    } as unknown as Parameters<typeof GET>[0]))
    await expect(card(2)).rejects.toMatchObject({ status: 404 })
    expect(looked).toEqual([])
    const response = await card(1, '?v=2026-01-01')
    expect(await response.text()).toBe('png')
    expect(response.headers.get('cache-control')).toBe('private, max-age=86400')
    await card(1, '?v=another')
    expect(looked).toHaveLength(2)
    expect(looked[0]).toBe(looked[1])
    expect(looked[0]).toMatch(/^https:\/\/rare\.glyphatlas\.org\/en\/entry\/1\/card\.png\?v=[0-9a-f]{16}$/)
    raw.exec("UPDATE entries SET ids = '木' WHERE id = 1")
    await card(1, '?v=2026-01-01')
    expect(looked[2]).not.toBe(looked[0])
  } finally { globals.caches = original }
})
