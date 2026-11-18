import { expect, test } from 'bun:test'
import { encode } from 'fast-png'
import { openTestDb } from '$lib/server/testdb'
import { getSourceArtwork, getVisibleSource } from '$lib/server/entries'
import { recordArtwork } from '$lib/server/social-card'
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
  expect(await getSourceArtwork(db, 2)).toEqual({ image_key: 'public.png', thumb_key: 'public-thumb.png' })
})

test('record artwork pairs its drawing with evidence when both are available', async () => {
  const path = 'M100 100h800v800H100z'
  const png = encode({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
  const cover = { size: png.byteLength, arrayBuffer: async () => png.slice().buffer } as R2ObjectBody
  const bucket = {
    get: async (key: string) => key === 'cover.png' ? cover : { text: async () => path } as R2ObjectBody,
    put: async () => { throw new Error('The drawing is already cached') },
  }
  const context = { origin: 'https://rare.glyphatlas.org', assets: { fetch: async () => new Response(null, { status: 404 }) } }
  const combined = await recordArtwork(bucket, { ids: '永' }, 'cover.png', context)
  expect(combined).toContain(`<path d="${path}"/>`)
  expect(combined).toContain('<image x="958"')
  expect(await recordArtwork(bucket, { ids: null }, 'cover.png', context)).toContain('<image x="719"')
  expect(await recordArtwork(bucket, { ids: '永' }, null, context)).toContain('width="320" height="320"')
})
