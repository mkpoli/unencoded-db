import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { editSighting, type SightingFields, type StoredImage } from '$lib/server/entries'
import { GET } from './[...key]/+server'

const original = `${'a'.repeat(64)}.png`, thumb = `${'b'.repeat(64)}.webp`, replacement = `${'c'.repeat(64)}.jpg`
const fields: SightingFields = { place: 'New place', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null }
const image: StoredImage = { image_key: replacement, thumb_key: replacement, image_type: 'image/jpeg', image_w: 20, image_h: 20, box: null }

test('sighting edits atomically replace or remove served pictures', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026'); INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(id, entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 1, 'book', 'p', '2026', '2026')")
  raw.prepare("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) VALUES (1, 0, ?, 'image/png', 20, 20, ?)").run(original, thumb)
  const status = async (key: string) => (await GET({ params: { key: `v2/${key}` }, platform: { env: { DB: db, MEDIA: { get: async () => ({ body: 'image', httpEtag: '"etag"' }) } } } } as any)).status
  const edit = (rev: number, media: StoredImage[]) => editSighting(db, 1, rev, fields, media, { actor: 'p', ip: null }, null, 1)
  expect(await status(original)).toBe(200)
  expect(await edit(1, [image])).toEqual({ ok: true, rev: 2 })
  expect(await status(original)).toBe(404)
  expect(await status(thumb)).toBe(404)
  expect(await status(replacement)).toBe(200)
  raw.exec("CREATE TRIGGER fail_index BEFORE INSERT ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
  await expect(edit(2, [])).rejects.toThrow('index failure')
  expect(await status(replacement)).toBe(200)
  expect(raw.query('SELECT s.rev, x.image_key FROM sightings s JOIN sighting_media x ON x.sighting_id = s.id WHERE s.id = 1').get()).toEqual({ rev: 2, image_key: replacement })
  raw.exec('DROP TRIGGER fail_index')
  expect(await edit(2, [])).toEqual({ ok: true, rev: 3 })
  expect(await status(replacement)).toBe(404)
})
