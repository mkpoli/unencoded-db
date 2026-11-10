import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { openTestDb } from '$lib/server/testdb'
import { GET } from './[...key]/+server'

const image = `${'a'.repeat(64)}.png`
const thumb = `${'b'.repeat(64)}.webp`
const orphan = `${'c'.repeat(64)}.jpg`

function seed(raw: Database) {
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026'), (2, 'han', 'p', '2026', '2026')")
  raw.prepare("INSERT INTO sightings(id, entry_id, first_entry, place, image_key, thumb_key, created_by, created_at, updated_at) VALUES (1, 1, 1, 'book', ?, ?, 'p', '2026', '2026')").run(image, thumb)
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
  raw.prepare("INSERT INTO sightings(id, entry_id, first_entry, place, image_key, thumb_key, created_by, created_at, updated_at) VALUES (2, 2, 2, 'shared', ?, ?, 'p', '2026', '2026')").run(image, image)
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
  raw.prepare('UPDATE sightings SET image_key = ?, thumb_key = NULL WHERE id = 1').run(orphan)
  expect((await request(db, thumb, calls)).status).toBe(404)
  expect((await request(db, orphan, calls, false)).headers.get('cache-control')).toBe('no-store')
  raw.exec('DELETE FROM sightings WHERE id = 2')
  expect((await request(db, image, calls)).status).toBe(404)
})

test('migration backfills only public media and query is a primary-key search', async () => {
  const raw = new Database(':memory:')
  raw.exec(readFileSync('migrations/0001_init.sql', 'utf8'))
  raw.exec(readFileSync('migrations/0002_api_indexes.sql', 'utf8'))
  seed(raw)
  raw.prepare("INSERT INTO sightings(id, entry_id, first_entry, place, image_key, created_by, created_at, updated_at, hidden_at) VALUES (2, 2, 2, 'hidden', ?, 'p', '2026', '2026', 'now'), (3, 2, 2, 'hidden entry', ?, 'p', '2026', '2026', NULL)").run(orphan, orphan)
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 2")
  raw.exec(readFileSync('migrations/0003_media_indexes.sql', 'utf8'))
  expect(raw.query('SELECT key FROM public_media_refs ORDER BY key').all()).toEqual([{ key: image }, { key: thumb }])
  const live = openTestDb()
  seed(live.raw)
  let plan = ''
  const traced = { prepare(sql: string) {
    return { bind(...values: unknown[]) {
      plan = (live.raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail).join('\n')
      return live.db.prepare(sql).bind(...values)
    } }
  } } as D1Database
  await request(traced, image, [])
  expect(plan).toContain('SEARCH public_media_refs USING PRIMARY KEY (key=?)')
  expect(plan).not.toMatch(/SCAN|TEMP B-TREE/)
  const missing = openTestDb()
  missing.raw.exec('DROP TABLE public_media_refs')
  await expect(request(missing.db, image, [])).rejects.toThrow()
})
