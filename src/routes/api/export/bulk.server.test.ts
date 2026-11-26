import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { exportBatches, mediaBatches } from '$lib/server/export'
import { GET } from './+server'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(script, ids, created_by, created_at, updated_at, hidden_at) VALUES ('han', ?, 'p', '2026', '2026', ?)")
  entry.run('⿰亻木', null)
  entry.run('⿰亻木', 'hidden')
  entry.run('⿱木木', null)
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value, data) VALUES (1, 1, 'read0001', 'reading', 'tung', '{\"doculect\":\"hak\"}')")
  raw.exec("INSERT INTO sources(hash, title, author) VALUES ('a', 'Book', 'Writer')")
  const sighting = raw.prepare("INSERT INTO sightings(entry_id, first_entry, source_id, place, created_by, created_at, updated_at, hidden_at) VALUES (?, ?, 1, ?, 'p', '2026', '2026', ?)")
  for (let i = 0; i < 250; i++) sighting.run(1, 1, `source ${i}`, null)
  sighting.run(1, 1, 'hidden sighting', 'hidden')
  sighting.run(2, 2, 'hidden entry', null)
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) SELECT id, p, k, 'image/png', 10, 20, k FROM sightings, (SELECT 0 AS p, 'one.png' AS k UNION SELECT 1, 'two.png') WHERE place = 'source 0'")
  return { db, raw }
}

const event = (db: D1Database, path = '/api/export') => ({ url: new URL(path, 'https://example.test'), platform: { env: { DB: db } } }) as any

test('one JSON file carries every record with its author, claims and evidence', async () => {
  const { db } = fixture()
  const response = await GET(event(db))
  expect(response.status).toBe(200)
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(response.headers.get('content-disposition')).toMatch(/rare-character-compendium-\d{4}-\d{2}-\d{2}\.json/)
  const body = await response.json() as any
  expect(body.dataset).toMatchObject({ name: 'Rare Character Compendium', version: 2, license: 'CC BY-SA 4.0', homepage: 'https://example.test/', counts: { records: 2, evidence: 250 } })
  expect(body.entries.map((entry: { id: number }) => entry.id)).toEqual([1, 3])
  expect(body.entries[0]).toMatchObject({ id: 1, code: 'R+0001', created_by_name: 'Person', types: [] })
  expect(body.entries[0].claims.map((claim: { kind: string }) => claim.kind)).toEqual(['ids', 'reading'])
  expect(body.entries[0].evidence).toHaveLength(250)
  expect(body.entries[0].evidence[0]).toMatchObject({ place: 'source 0', title: 'Book', author: 'Writer', by_name: 'Person', types: [] })
  expect(body.entries[0].evidence[0].media).toHaveLength(2)
  expect(body.entries[1].evidence).toEqual([])
})

test('the CSV file has a row for every piece of evidence and one for an empty record', async () => {
  const { db } = fixture()
  const response = await GET(event(db, '/api/export?format=csv'))
  expect(response.headers.get('content-disposition')).toContain('.csv')
  const csv = await response.text()
  const [head, ...rows] = csv.split('\r\n').filter(Boolean)
  expect(head).toContain('"record_code"')
  expect(head).toContain('"created_by_name"')
  expect(rows).toHaveLength(251)
  expect(rows.filter(row => row.includes('source '))).toHaveLength(250)
  expect(rows[0]).toContain('"R+0001"')
  expect(rows[0]).toContain('"hak:tung"')
  expect(rows[0]).toContain('"one.png; two.png"')
})

test('the image list gives each visible picture its record, source and absolute addresses', async () => {
  const { db } = fixture()
  const response = await GET(event(db, '/api/export?format=media'))
  expect(response.headers.get('content-disposition')).toContain('.media.csv')
  const [head, ...rows] = (await response.text()).split('\r\n').filter(Boolean)
  expect(head).toContain('"image_url"')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toContain('"R+0001"')
  expect(rows[0]).toContain('"https://example.test/media/v2/one.png"')
  expect(rows[0]).toContain('"Book"')
  expect(rows[0]).toContain('"Writer"')
})

test('the dataset walk and the image walk continue past a page', async () => {
  const { db } = fixture()
  const counts = new Map<number, number>()
  for await (const batch of exportBatches(db, 17)) for (const entry of batch) counts.set(entry.id, (counts.get(entry.id) ?? 0) + entry.evidence.length)
  expect([...counts]).toEqual([[1, 250], [3, 0]])
  const media: string[] = []
  for await (const batch of mediaBatches(db, 1)) media.push(...batch.map(row => row.image_key))
  expect(media).toEqual(['one.png', 'two.png'])
})

test('an unknown format is refused', async () => {
  const { db } = fixture()
  await expect(GET(event(db, '/api/export?format=xml'))).rejects.toMatchObject({ status: 400 })
})

function manyFixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(script, ids, created_by, created_at, updated_at) VALUES ('han', '⿰亻木', 'p', '2026', '2026')")
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (1, 0, 'ids00001', 'ids', '⿰亻木')")
  const insert = raw.prepare("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, ?, 'p', '2026', '2026')")
  for (let i = 0; i < 900; i++) insert.run(`source ${i}`)
  return { db, raw }
}


test('the JSON download pulls one batch at a time instead of reading ahead', async () => {
  const { db } = manyFixture()
  let queries = 0
  const counting = { prepare(sql: string) { queries++; return db.prepare(sql) } } as D1Database
  const response = await GET(event(counting))
  // One query for the counts, and at most one page on the first pull. The old start()-driven
  // producer read every page before the caller saw a byte.
  expect(queries).toBeLessThan(5)
  const body = await response.json() as any
  expect(body.entries[0].evidence).toHaveLength(900)
  expect(queries).toBeGreaterThan(5)
})

test('the CSV download keeps every row when a record spans several batches', async () => {
  const { db } = manyFixture()
  const csv = await (await GET(event(db, '/api/export?format=csv'))).text()
  const rows = csv.split('\r\n').filter(Boolean)
  expect(rows).toHaveLength(901)
  expect(rows.filter(row => row.includes('source '))).toHaveLength(900)
})

test('an empty dataset gives valid JSON and header-only CSV files', async () => {
  const { db } = openTestDb()
  const body = await (await GET(event(db, '/api/export?format=json'))).json() as any
  expect(body.dataset.counts).toEqual({ records: 0, evidence: 0 })
  expect(body.entries).toEqual([])
  const csv = await (await GET(event(db, '/api/export?format=csv'))).text()
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1)
  const media = await (await GET(event(db, '/api/export?format=media'))).text()
  expect(media.split('\r\n').filter(Boolean)).toHaveLength(1)
})

test('a download fails when a record changes while it is being read', async () => {
  const { db, raw } = manyFixture()
  const response = await GET(event(db))
  const reader = response.body!.getReader()
  await reader.read()
  raw.exec("INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (1, 'edit', 2, '{}', 'p', '2026')")
  await expect((async () => { for (;;) { const { done } = await reader.read(); if (done) break } })()).rejects.toThrow('changed during the download')
})

test('the image list walks the media primary key without a scan or a sort', async () => {
  const { db, raw } = fixture()
  const plans: string[][] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
      return stmt.bind(...values)
    } }
  } } as D1Database
  for await (const batch of mediaBatches(traced, 1)) expect(batch.length).toBe(1)
  expect(plans.flat().join('\n')).toContain('SEARCH m USING PRIMARY KEY')
  expect(plans.flat().join('\n')).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN m(?:\s|$)/)
})

test('exports preserve agent attribution alongside the commander name', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, atlas_sub, created_at) VALUES ('cmd', 'Commander', 'sub', '2026');
    INSERT INTO people(id, name, created_at, merged_into, agent) VALUES ('ag1', 'Antigravity Gemini 4 Neon', '2026', 'cmd', 1);
    INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (1, 'han', '⿰亻木', 'ag1', '2026', '2026'), (2, 'han', '⿱木木', 'cmd', '2026', '2026');
    INSERT INTO claims(entry_id, position, key, kind, value) VALUES (1, 0, 'ids00001', 'ids', '⿰亻木'), (2, 0, 'ids00002', 'ids', '⿱木木');
    INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'Book', 'ag1', '2026', '2026'), (2, 2, 'Note', 'cmd', '2026', '2026');`)
  const body = await (await GET(event(db))).json() as any
  expect(body.entries[0]).toMatchObject({ created_by_name: 'Commander', created_by_agent: 'Antigravity Gemini 4 Neon' })
  expect(body.entries[0].evidence[0]).toMatchObject({ by_id: 'cmd', by_name: 'Commander', by_agent: 'Antigravity Gemini 4 Neon' })
  expect(body.entries[1]).toMatchObject({ created_by_name: 'Commander', created_by_agent: null })
  expect(body.entries[1].evidence[0]).toMatchObject({ by_id: 'cmd', by_name: 'Commander', by_agent: null })
  const csv = await (await GET(event(db, '/api/export?format=csv'))).text()
  const [head, first, second] = csv.split('\r\n').filter(Boolean)
  expect(head).toContain('"created_by_agent"')
  expect(first).toContain('"Commander","Antigravity Gemini 4 Neon"')
  expect(second).toContain('"Commander",""')
})
