import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { exportBatches, indexChunks, mediaBatches, mergedBatches } from '$lib/server/export'
import { GET } from './+server'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(ids, created_by, created_at, updated_at, hidden_at) VALUES (?, 'p', '2026', '2026', ?)")
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

test('the CSV file puts closeness last, and the JSON file carries it with each piece of evidence', async () => {
  const { db, raw } = fixture()
  raw.exec("UPDATE sightings SET closeness = 'primary' WHERE place = 'source 0'")
  const [head, first] = (await (await GET(event(db, '/api/export?format=csv'))).text()).split('\r\n')
  expect(head.split(',').slice(-4)).toEqual(['"vias"', '"images"', '"cites"', '"closeness"'])
  expect(first.endsWith(',"primary"')).toBe(true)
  const body = await (await GET(event(db))).json() as any
  expect(body.entries[0].evidence[0].closeness).toBe('primary')
  expect(body.entries[0].evidence[1].closeness).toBeNull()
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
  raw.exec("INSERT INTO entries(ids, created_by, created_at, updated_at) VALUES ('⿰亻木', 'p', '2026', '2026')")
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
  expect(body.merged).toEqual([])
  const csv = await (await GET(event(db, '/api/export?format=csv'))).text()
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1)
  const media = await (await GET(event(db, '/api/export?format=media'))).text()
  expect(media.split('\r\n').filter(Boolean)).toHaveLength(1)
  const merged = await (await GET(event(db, '/api/export?format=merged'))).text()
  expect(merged.split('\r\n').filter(Boolean)).toEqual(['"id","code","merged_into","merged_into_code"'])
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

test('exports preserve separated agent and model attribution alongside the commander name', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, atlas_sub, created_at) VALUES ('cmd', 'Commander', 'sub', '2026');
    INSERT INTO people(id, name, created_at, merged_into, agent, agent_model) VALUES ('ag1', 'Antigravity', '2026', 'cmd', 1, 'Gemini 4 Neon');
    INSERT INTO entries(id, ids, created_by, created_at, updated_at) VALUES (1, '⿰亻木', 'ag1', '2026', '2026'), (2, '⿱木木', 'cmd', '2026', '2026');
    INSERT INTO claims(entry_id, position, key, kind, value) VALUES (1, 0, 'ids00001', 'ids', '⿰亻木'), (2, 0, 'ids00002', 'ids', '⿱木木');
    INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at) VALUES (1, 1, 'Book', 'ag1', '2026', '2026'), (2, 2, 'Note', 'cmd', '2026', '2026');`)
  const body = await (await GET(event(db))).json() as any
  expect(body.entries[0]).toMatchObject({ created_by_name: 'Commander', created_by_agent: 'Antigravity', created_by_model: 'Gemini 4 Neon' })
  expect(body.entries[0].evidence[0]).toMatchObject({ by_id: 'cmd', by_name: 'Commander', by_agent: 'Antigravity', by_model: 'Gemini 4 Neon' })
  expect(body.entries[1]).toMatchObject({ created_by_name: 'Commander', created_by_agent: null, created_by_model: null })
  expect(body.entries[1].evidence[0]).toMatchObject({ by_id: 'cmd', by_name: 'Commander', by_agent: null, by_model: null })
  const csv = await (await GET(event(db, '/api/export?format=csv'))).text()
  const [head, first, second] = csv.split('\r\n').filter(Boolean)
  expect(head).toContain('"created_by_agent","created_by_model"')
  expect(first).toContain('"Commander","Antigravity","Gemini 4 Neon"')
  expect(second).toContain('"Commander","",""')
})

test('format=index serves a compact cached catalogue without evidence and tolerates mid-walk writes', async () => {
  const { db, raw } = fixture()
  const stored = new Map<string, { body: string; headers: Headers }>()
  const waits: Promise<unknown>[] = []
  const fakeCtx = {
    waitUntil(this: unknown, promise: Promise<unknown>) {
      // Workers ExecutionContext.waitUntil throws Illegal invocation if detached from its receiver.
      if (this !== fakeCtx) throw new TypeError('Illegal invocation')
      waits.push(promise)
    },
  }
  const origCaches = (globalThis as any).caches
  ;(globalThis as any).caches = {
    default: {
      async match(req: Request) {
        const hit = stored.get(req.url)
        return hit ? new Response(hit.body, { headers: hit.headers }) : undefined
      },
      async put(req: Request, res: Response) {
        stored.set(req.url, { body: await res.text(), headers: new Headers(res.headers) })
      },
    },
  }
  try {
    let queries = 0
    const counting = { prepare(sql: string) { queries++; return db.prepare(sql) } } as D1Database
    const first = await GET({ url: new URL('https://example.test/api/export?format=index&utm_source=ignored'), platform: { env: { DB: counting }, ctx: fakeCtx } } as any)
    expect(first.status).toBe(200)
    expect(first.headers.get('access-control-allow-origin')).toBe('*')
    expect(first.headers.get('content-type')).toContain('application/json')
    expect(first.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
    expect(first.headers.get('content-disposition')).toBeNull()
    const body = await first.json() as any
    await Promise.all(waits)
    expect(waits).toHaveLength(1)
    expect(stored.has('https://example.test/api/export?format=index')).toBe(true)
    expect(body.dataset).toMatchObject({ name: 'Rare Character Compendium', version: 2, license: 'CC BY-SA 4.0' })
    expect(body.entries.map((entry: { id: number }) => entry.id)).toEqual([1, 3])
    expect(body.entries[0]).toMatchObject({ id: 1, code: 'R+0001', ids: '⿰亻木' })
    expect(body.entries[0].evidence).toBeUndefined()
    expect(body.entries[0].claims).toEqual([
      { kind: 'ids', value: '⿰亻木' },
      { kind: 'reading', value: 'tung', data: { doculect: 'hak' } },
    ])

    // Second request (even with different extra query params) hits the edge cache with zero D1 reads.
    const beforeHit = queries
    const second = await GET({ url: new URL('https://example.test/api/export?format=index&v=2'), platform: { env: { DB: counting }, ctx: fakeCtx } } as any)
    expect(await second.json()).toEqual(body)
    expect(queries).toBe(beforeHit)
  } finally {
    ;(globalThis as any).caches = origCaches
  }

  // Concurrent entry + claim insertions between page 1 and page 2 still produce valid complete JSON.
  let entryReads = 0
  const mutating = {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        bind(...values: unknown[]) {
          if (sql.includes('FROM entries')) {
            entryReads++
            if (entryReads === 2) {
              raw.exec("INSERT INTO entries(id, ids, created_by, created_at, updated_at) VALUES (4, '⿰水水', 'p', '2026', '2026')")
              raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (4, 0, 'ids00004', 'ids', '⿰水水')")
              raw.exec("INSERT INTO revisions(entry_id, kind, rev, snapshot, actor, at) VALUES (4, 'create', 1, '{}', 'p', '2026')")
            }
          }
          return stmt.bind(...values)
        },
      }
    },
  } as D1Database
  let text = ''
  for await (const chunk of indexChunks(mutating, 'https://example.test', '2026-11-26T00:00:00.000Z', 1)) text += chunk
  const liveDoc = JSON.parse(text) as { entries: { id: number }[] }
  expect(liveDoc.entries.map(e => e.id)).toEqual([1, 3, 4])
})

test('format=index walks entries_live_export and claims_by_entry without scans or temp sorts', async () => {
  const { db, raw } = fixture()
  const plans: string[][] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return {
      first<T>() {
        plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map(row => row.detail))
        return stmt.first<T>()
      },
      bind(...values: unknown[]) {
        plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
        return stmt.bind(...values)
      },
    }
  } } as D1Database
  let text = ''
  for await (const chunk of indexChunks(traced, 'https://example.test', '2026-11-26T00:00:00.000Z', 1)) text += chunk
  const doc = JSON.parse(text) as { entries: unknown[] }
  expect(doc.entries).toHaveLength(2)
  const joined = plans.flat().join('\n')
  expect(joined).toContain('entries_live_export')
  expect(joined).toContain('claims_by_entry')
  expect(joined).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN (?:entries|claims)(?:\s|$)/)

  // Prove the guard fails if any index is removed.
  for (const index of ['entries_live_export', 'claims_by_entry', 'entries_merged_export']) {
    const missing = fixture()
    missing.raw.exec(`DROP INDEX ${index}`)
    await expect((async () => {
      for await (const _ of indexChunks(missing.db, 'https://example.test', '2026-11-26T00:00:00.000Z', 1)) {}
    })()).rejects.toThrow()
  }
})

test('exports resolve retired record codes to canonical live targets and omit hidden chains', async () => {
  const { db, raw } = fixture()
  // 1 and 3 are live, 2 is hidden.
  // 4 -> 1 (direct), 5 -> 2 (hidden target), 6 -> 4 -> 1 (multi-hop), 7 -> 1 (hidden itself), 8 -> 7 -> 1 (hidden intermediate).
  raw.exec(`INSERT INTO entries(id, merged_into, hidden_at, created_by, created_at, updated_at) VALUES
    (4, 1, NULL, 'p', '2026', '2026'),
    (5, 2, NULL, 'p', '2026', '2026'),
    (6, 4, NULL, 'p', '2026', '2026'),
    (7, 1, 'hidden', 'p', '2026', '2026'),
    (8, 7, NULL, 'p', '2026', '2026')`)
  const expected = [
    { id: 4, code: 'R+0004', merged_into: 1, merged_into_code: 'R+0001' },
    { id: 6, code: 'R+0006', merged_into: 1, merged_into_code: 'R+0001' },
  ]

  const jsonBody = await (await GET(event(db, '/api/export?format=json'))).json() as any
  expect(jsonBody.merged).toEqual(expected)

  const indexBody = await (await GET(event(db, '/api/export?format=index'))).json() as any
  expect(indexBody.merged).toEqual(expected)

  const csvRes = await GET(event(db, '/api/export?format=merged'))
  expect(csvRes.status).toBe(200)
  expect(csvRes.headers.get('content-disposition')).toMatch(/rare-character-compendium-\d{4}-\d{2}-\d{2}\.merged\.csv/)
  expect((await csvRes.text()).split('\r\n').filter(Boolean)).toEqual([
    '"id","code","merged_into","merged_into_code"',
    '"4","R+0004","1","R+0001"',
    '"6","R+0006","1","R+0001"',
  ])

  // Walks across single-row batches and uses entries_merged_export without scans or temp sorts.
  const plans: string[][] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
      return stmt.bind(...values)
    } }
  } } as D1Database
  const walked = []
  for await (const batch of mergedBatches(traced, 1)) walked.push(...batch)
  expect(walked).toEqual(expected)
  const joined = plans.flat().join('\n')
  expect(joined).toContain('entries_merged_export')
  expect(joined).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN entries(?:\s|$)/)
})

test('mergedBatches chunks target lookups below D1 parameter limits', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM seq WHERE x < 120)
    INSERT INTO entries(id, created_by, created_at, updated_at) SELECT x, 'p', '2026', '2026' FROM seq`)
  raw.exec(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM seq WHERE x < 120)
    INSERT INTO entries(id, merged_into, created_by, created_at, updated_at) SELECT x + 120, x, 'p', '2026', '2026' FROM seq`)
  let maxBinds = 0
  const guarded = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      maxBinds = Math.max(maxBinds, values.length)
      if (values.length > 100) throw new Error('too many SQL variables')
      return stmt.bind(...values)
    } }
  } } as D1Database
  const rows = []
  for await (const batch of mergedBatches(guarded, 500)) rows.push(...batch)
  expect(rows).toHaveLength(120)
  expect(maxBinds).toBeLessThanOrEqual(90)
})

test('mergedBatches resolves each batch fresh under concurrent unmerge and re-merge', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, merged_into, created_by, created_at, updated_at) VALUES
      (1, NULL, 'p', '2026', '2026'),
      (2, 1, 'p', '2026', '2026'),
      (3, 1, 'p', '2026', '2026'),
      (4, NULL, 'p', '2026', '2026');`)
  let pages = 0
  const mutating = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      if (sql.includes('entries_merged_export')) {
        pages++
        if (pages === 2) raw.exec('UPDATE entries SET merged_into = NULL WHERE id = 2; UPDATE entries SET merged_into = 2 WHERE id = 4')
      }
      return stmt.bind(...values)
    } }
  } } as D1Database
  const rows = []
  for await (const batch of mergedBatches(mutating, 1)) rows.push(...batch)
  expect(rows).toEqual([
    { id: 2, code: 'R+0002', merged_into: 1, merged_into_code: 'R+0001' },
    { id: 3, code: 'R+0003', merged_into: 1, merged_into_code: 'R+0001' },
    { id: 4, code: 'R+0004', merged_into: 2, merged_into_code: 'R+0002' },
  ])
})

test('mergedBatches resolves long chains across batch boundaries without dropping records', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec(`WITH RECURSIVE seq(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM seq WHERE x < 502)
    INSERT INTO entries(id, merged_into, created_by, created_at, updated_at)
    SELECT x, CASE WHEN x = 1 THEN NULL ELSE x - 1 END, 'p', '2026', '2026' FROM seq`)
  for (const size of [500, 25]) {
    const rows = []
    for await (const batch of mergedBatches(db, size)) rows.push(...batch)
    expect(rows).toHaveLength(501)
    expect(rows.at(-1)).toEqual({ id: 502, code: 'R+01F6', merged_into: 1, merged_into_code: 'R+0001' })
  }
})
