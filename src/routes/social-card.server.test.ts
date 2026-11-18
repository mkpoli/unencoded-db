import { expect, test } from 'bun:test'
import { encode } from 'fast-png'
import { openTestDb } from '$lib/server/testdb'
import { getSourceArtwork, getVisibleSource } from '$lib/server/entries'
import { panelView, recordArtwork } from '$lib/server/social-card'
import { GET } from './[locale]/[kind]/[id]/card.png/+server'

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
