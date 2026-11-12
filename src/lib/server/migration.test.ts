import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { sightingSnapshot } from './revisions'

const migration = (name: string) => readFileSync(join(import.meta.dir, '../../../migrations', name), 'utf8')

test('a sighting snapshot written before 0002 is restorable after it', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, media: [] })
  expect(sightingSnapshot(old)).toBeNull()
  const insert = raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, ?, ?, 1, ?, 'p', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  insert.run(1, 'sighting', old)
  insert.run(1, 'sighting_edit', old)
  insert.run(null, 'hide', '{}')
  insert.run(1, 'redact', '{"revision":1}')
  raw.exec(migration('0002_sighting_via.sql'))
  const rows = raw.query('SELECT kind, snapshot FROM revisions ORDER BY id').all() as { kind: string; snapshot: string }[]
  for (const row of rows.slice(0, 2)) expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', title: 'Book', via_url: null, via_title: null, via_report_date: null })
  expect(rows.slice(2).map(row => row.snapshot)).toEqual(['{}', '{"revision":1}'])
})

test('0002 and 0003 together give an old sighting snapshot the via fields and array boxes', () => {
  const raw = new Database(':memory:')
  raw.exec(migration('0001_init.sql'))
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, created_by, created_at, updated_at) VALUES ('han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'A shop', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key, box) VALUES (1, 0, 'a.webp', 'image/webp', 100, 80, 't.webp', '[1,2,10,10]'), (1, 1, 'b.webp', 'image/webp', 100, 80, 't2.webp', NULL)")
  const old = JSON.stringify({ place: 'A shop', url: null, title: 'Book', author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null, media: [{ image_key: 'a.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't.webp', box: '[1,2,10,10]' }, { image_key: 'b.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 't2.webp', box: null }] })
  raw.prepare("INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at) VALUES (1, 1, 'sighting_edit', 1, ?, 'p', '2026')").run(old)
  raw.exec(migration('0002_sighting_via.sql'))
  raw.exec(migration('0003_media_boxes.sql'))
  const row = raw.query('SELECT snapshot FROM revisions').get() as { snapshot: string }
  expect(sightingSnapshot(row.snapshot)).toMatchObject({ place: 'A shop', via_url: null })
  expect(JSON.parse(row.snapshot).media.map((image: { box: string | null }) => image.box)).toEqual(['[[1,2,10,10]]', null])
  expect((raw.query('SELECT box FROM sighting_media ORDER BY position').all() as { box: string | null }[]).map(image => image.box)).toEqual(['[[1,2,10,10]]', null])
})
