import { expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { openTestDb } from '$lib/server/testdb'
import { GET } from './[...key]/+server'

const image = `${'a'.repeat(64)}.png`
const thumb = `${'b'.repeat(64)}.webp`
const orphan = `${'c'.repeat(64)}.jpg`

function seed(raw: Database) {
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026'), (2, 'han', 'p', '2026', '2026')")
  raw.exec("INSERT INTO sightings(id, entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 1, 'book', 'p', '2026', '2026')")
  pictured(raw, 1, image, thumb)
}

function pictured(raw: Database, sighting: number, image: string, thumb: string) {
  raw.prepare("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) VALUES (?, 0, ?, 'image/png', 20, 20, ?)").run(sighting, image, thumb)
}

function request(db: D1Database, key: string, calls: string[], exists = true) {
  return GET({ params: { key: `v2/${key}` }, platform: { env: { DB: db, MEDIA: { get: async (key: string) => { calls.push(key); return exists ? { body: 'image', httpEtag: '"etag"' } : null } } } } } as any)
}

test('media follows live sightings and entries, including shared and merged references', async () => {
  const { db, raw } = openTestDb()
  seed(raw)
  const calls: string[] = []
  const legacy = await GET({ params: { key: image }, platform: { env: { DB: db } } } as any)
  expect(legacy.status).toBe(404)
  expect(legacy.headers.get('cache-control')).toBe('no-store')
  for (const key of [image, thumb]) {
    const response = await request(db, key, calls)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe(key === image ? 'image/png' : 'image/webp')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  }
  raw.exec("INSERT INTO sightings(id, entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (2, 2, 2, 'shared', 'p', '2026', '2026')")
  pictured(raw, 2, image, image)
  raw.exec("UPDATE sightings SET hidden_at = 'now' WHERE id = 1")
  expect((await request(db, image, calls)).status).toBe(200)
  expect((await request(db, thumb, calls)).status).toBe(404)
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 2")
  const before = calls.length
  for (const key of [image, thumb, orphan, 'invalid']) {
    const response = await request(db, key, calls)
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
  }
  expect(calls.length).toBe(before)
  raw.exec("UPDATE entries SET hidden_at = NULL, merged_into = 1 WHERE id = 2")
  expect((await request(db, image, calls)).status).toBe(404)
  raw.exec('UPDATE entries SET merged_into = NULL WHERE id = 2')
  expect((await request(db, image, calls)).status).toBe(200)
  raw.exec('UPDATE entries SET merged_into = 1 WHERE id = 2; UPDATE sightings SET entry_id = 1 WHERE id = 2')
  expect((await request(db, image, calls)).status).toBe(200)
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  expect((await request(db, image, calls)).status).toBe(404)
  raw.exec('UPDATE entries SET hidden_at = NULL WHERE id = 1; UPDATE sightings SET hidden_at = NULL WHERE id = 1')
  expect((await request(db, thumb, calls)).status).toBe(200)
  raw.prepare('UPDATE sighting_media SET image_key = ?, thumb_key = ? WHERE sighting_id = 1').run(orphan, orphan)
  expect((await request(db, thumb, calls)).status).toBe(404)
  expect((await request(db, orphan, calls, false)).headers.get('cache-control')).toBe('no-store')
  raw.exec('DELETE FROM sighting_media WHERE sighting_id = 2')
  expect((await request(db, image, calls)).status).toBe(404)
})

test('a key is looked up by its index and a missing table refuses every key', async () => {
  const live = openTestDb()
  seed(live.raw)
  const plans: string[] = []
  const traced = { prepare(sql: string) {
    return { bind(...values: unknown[]) {
      plans.push((live.raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail).join('\n'))
      return live.db.prepare(sql).bind(...values)
    } }
  } } as D1Database
  await request(traced, image, [])
  const plan = plans.join('\n')
  expect(plan).toContain('SEARCH x USING COVERING INDEX sighting_media_by_image (image_key=?)')
  expect(plan).toContain('SEARCH x USING COVERING INDEX sighting_media_by_thumb (thumb_key=?)')
  expect(plan).not.toMatch(/SCAN|TEMP B-TREE/)
  const missing = openTestDb()
  missing.raw.exec('DROP TABLE sighting_media')
  await expect(request(missing.db, image, [])).rejects.toThrow()
})
