import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { exportPage, sameIds } from '$lib/server/entries'
import { GET as exportGet } from './entries/+server'
import { GET as fontExport } from './font-export/+server'
import { composerDrawing, GLYPH_STYLES } from '$lib/composer'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(script, ids, created_by, created_at, updated_at, hidden_at) VALUES ('han', ?, 'p', '2026', '2026', ?)")
  entry.run('⿰亻木', null)
  entry.run('⿰亻木', 'hidden')
  entry.run('⿰亻木', null)
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
  const sighting = raw.prepare("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at, hidden_at) VALUES (?, ?, ?, 'p', '2026', '2026', ?)")
  for (let i = 0; i < 250; i++) sighting.run(1, 1, `source ${i}`, null)
  for (let i = 0; i < 250; i++) sighting.run(2, 2, 'hidden entry', null)
  sighting.run(1, 1, 'hidden sighting', 'hidden')
  return { db, raw }
}

test('export walks every visible sighting and empty entry with a composite cursor', async () => {
  const { db } = fixture()
  let after = 0, sighting: number | null = null
  const sources: string[] = [], entries: number[] = []
  do {
    const page = await exportPage(db, after, 17, sighting)
    expect(page.entries.reduce((sum, entry) => sum + Math.max(1, entry.evidence.length), 0)).toBeLessThanOrEqual(17)
    for (const entry of page.entries) { entries.push(entry.id); sources.push(...entry.evidence.map(s => s.place)) }
    if (page.next === null) break
    after = page.next; sighting = page.next_sighting
  } while (true)
  expect(sources).toEqual(Array.from({ length: 250 }, (_, i) => `source ${i}`))
  expect([...new Set(entries)]).toEqual([1, 3])
})

test('export gives source types and contexts as lists in JSON and readable cells in CSV', async () => {
  const { db, raw } = fixture()
  raw.prepare("UPDATE sightings SET types = ?, contexts = ? WHERE entry_id = 1 AND place = 'source 0'").run(JSON.stringify(['mention', 'definition']), JSON.stringify(['running_text', 'heading']))
  const jsonResponse = await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=json'), platform: { env: { DB: db } } } as any)
  const body = await jsonResponse.json() as any
  expect(body.entries[0].evidence[0].types).toEqual(['mention', 'definition'])
  expect(body.entries[0].evidence[0].contexts).toEqual(['running_text', 'heading'])
  const csvResponse = await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=csv'), platform: { env: { DB: db } } } as any)
  const csv = await csvResponse.text()
  expect(csv).toContain('"mention, definition"')
  expect(csv).toContain('"running_text, heading"')
})

test('export carries the via chain in JSON and CSV', async () => {
  const { db, raw } = fixture()
  raw.exec("INSERT INTO sources(hash, title) VALUES ('a', 'Book'), ('b', 'A post'), ('c', 'A thread')")
  raw.exec("UPDATE sightings SET source_id = 1 WHERE entry_id = 1 AND place = 'source 0'")
  raw.exec("INSERT INTO sighting_vias(sighting_id, position, source_id, quote) SELECT id, 1, 3, NULL FROM sightings WHERE place = 'source 0'; INSERT INTO sighting_vias(sighting_id, position, source_id, quote) SELECT id, 0, 2, 'Quoted words' FROM sightings WHERE place = 'source 0'")
  const body = await (await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=json'), platform: { env: { DB: db } } } as any)).json() as any
  const via = (id: number, title: string, quote: string | null) => ({ id, url: null, title, author: null, publisher: null, report_date: null, quote })
  expect(body.entries[0].evidence[0]).toMatchObject({ title: 'Book', vias: [via(2, 'A post', 'Quoted words'), via(3, 'A thread', null)] })
  expect(body.entries[0].evidence[1].vias).toEqual([])
  const csv = await (await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=csv'), platform: { env: { DB: db } } } as any)).text()
  const [head, first] = csv.split('\r\n')
  expect(head).toContain('"vias"')
  expect(first).toContain('A thread')
  expect(first).toContain('Quoted words')
})

test('export links preserve the sighting cursor in JSON and CSV', async () => {
  const { db } = fixture()
  for (const format of ['json', 'csv']) {
    let url = `https://example.test/api/entries?limit=10&format=${format}`
    let count = 0
    do {
      const response = await exportGet({ url: new URL(url), platform: { env: { DB: db } } } as any)
      expect(response.status).toBe(200)
      const body = await response.text()
      if (format === 'json') count += JSON.parse(body).entries.reduce((n: number, entry: { evidence: unknown[] }) => n + entry.evidence.length, 0)
      else count += body.split('\r\n').filter(line => line.includes('source ')).length
      const link = response.headers.get('Link')
      url = link?.match(/^<([^>]+)>/)?.[1] ?? ''
    } while (url)
    expect(count).toBe(250)
  }
  await expect(exportGet({ url: new URL('https://example.test/api/entries?sighting=1'), platform: { env: { DB: db } } } as any)).rejects.toMatchObject({ status: 400 })
})

test('export gives every claim kind a column and the pictures a cell', async () => {
  const { db, raw } = fixture()
  raw.exec(`INSERT INTO claims(entry_id, position, key, kind, value, data, sightings, under) VALUES
    (1, 1, 'ids00002', 'ids', '⿱亻木', NULL, '[]', '[]'), (1, 2, 'read0001', 'reading', 'tung', '{"doculect":"hak"}', '[2]', '["mean0001"]'), (1, 3, 'read0002', 'reading', 'dong', NULL, '[]', '[]'),
    (1, 4, 'mean0001', 'meaning', 'east hill', NULL, '[1,2]', '[]'), (1, 5, 'mean0002', 'meaning', 'a pile', NULL, '[]', '[]'),
    (1, 6, 'code0001', 'encoding', 'U+5D20', '{"charset":"unicode"}', '[]', '[]'),
    (1, 12, 'doc00001', 'document', 'L2/25-056', '{"page":"12"}', '[]', '[]'),
    (1, 7, 'rela0001', 'relation', '崬', '{"relationship":"variant"}', '[1]', '["mean0001","read0001"]'), (1, 8, 'rela0002', 'relation', '堆', '{"relationship":"usage"}', '[]', '["mean0002"]'),
    (1, 9, 'rela0003', 'relation', '東', '{"relationship":"similar"}', '[]', '[]'),
    (1, 10, 'genr0001', 'tag', 'hakka', NULL, '[]', '[]'), (1, 11, 'tag00001', 'tag', 'IRG', NULL, '[]', '[]')`)
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) SELECT id, p, k, 'image/png', 1, 1, k FROM sightings, (SELECT 0 AS p, 'one.png' AS k UNION SELECT 1, 'two.png') WHERE place = 'source 0'")
  const response = await exportGet({ url: new URL('https://example.test/api/entries?limit=2&format=csv'), platform: { env: { DB: db } } } as any)
  const [head, first] = (await response.text()).split('\r\n')
  const columns = head.split(',').map(column => column.slice(1, -1))
  const cells = first.split('","').map(cell => cell.replace(/^"|"$/g, ''))
  for (const kind of ['ids', 'composition', 'reading', 'meaning', 'encoding', 'document', 'relation', 'ivd', 'collection', 'tag', 'images']) expect(columns).toContain(kind)
  const cell = (name: string) => cells[columns.indexOf(name)]
  expect(cell('ids')).toBe('⿰亻木; ⿱亻木')
  // A claim names what it holds under after its value, and the evidence rows it rests on by their id.
  expect(cell('reading')).toBe('hak:tung [under: east hill] [evidence: #2]; dong')
  expect(cell('meaning')).toBe('east hill [evidence: #1 #2]; a pile')
  expect(cell('encoding')).toBe('unicode:U+5D20')
  expect(cell('document')).toBe('L2/25-056 p. 12')
  expect(cell('relation')).toBe('崬 (variant) [under: east hill | hak:tung] [evidence: #1]; 堆 (usage) [under: a pile]; 東 (similar)')
  expect(cell('tag')).toBe('hakka; IRG')
  expect(cell('images')).toBe('one.png; two.png')
})

test('export carries claims and pictures in JSON', async () => {
  const { db, raw } = fixture()
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value, data, sightings, under) VALUES (1, 1, 'code0001', 'encoding', 'U+5D20', '{\"charset\":\"unicode\"}', '[]', '[]'), (1, 2, 'mean0001', 'meaning', 'east', NULL, '[1,3]', '[]'), (1, 3, 'rela0001', 'relation', '東', '{\"relationship\":\"usage\"}', '[3]', '[\"mean0001\"]')")
  raw.exec("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key) SELECT id, 0, 'one.png', 'image/png', 1, 1, 'one-t.png' FROM sightings WHERE place = 'source 0'")
  const page = await exportPage(db, 0, 2)
  expect(page.entries[0].claims).toEqual([
    { key: 'ids00001', kind: 'ids', value: '⿰亻木', data: null, sightings: [], under: [] },
    { key: 'code0001', kind: 'encoding', value: 'U+5D20', data: { charset: 'unicode' }, sightings: [], under: [] },
    { key: 'mean0001', kind: 'meaning', value: 'east', data: null, sightings: [1, 3], under: [] },
    { key: 'rela0001', kind: 'relation', value: '東', data: { relationship: 'usage' }, sightings: [3], under: ['mean0001'] },
  ])
  const body = await (await exportGet({ url: new URL('https://example.test/api/entries?limit=2&format=json'), platform: { env: { DB: db } } } as any)).json() as any
  expect(body.entries[0].claims[3]).toEqual({ key: 'rela0001', kind: 'relation', value: '東', data: { relationship: 'usage' }, sightings: [3], under: ['mean0001'] })
  expect(page.entries[0].evidence[0].media).toEqual([{ image_key: 'one.png', image_type: 'image/png', image_w: 1, image_h: 1, thumb_key: 'one-t.png', box: null }])
  expect(page.entries[0].evidence[1].media).toEqual([])
})

test('export and exact match use their indexes without temporary sorts', async () => {
  const { db, raw } = fixture()
  const plans: string[][] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
      return stmt.bind(...values)
    } }
  } } as D1Database
  await exportPage(traced, 0, 10)
  await exportPage(traced, 1, 10, 10)
  await sameIds(traced, '⿰亻木')
  for (const plan of plans) {
    expect(plan.join('\n')).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN (?:e|s|k|c|entries|sightings|claims|sources|sighting_media)(?:\s|$)/)
  }
  expect(plans.flat().join('\n')).toContain('entries_live_export')
  expect(plans.flat().join('\n')).toContain('sightings_visible_export')
  expect(plans.flat().join('\n')).toContain('SEARCH sighting_media USING PRIMARY KEY (sighting_id=?)')
  expect(plans.flat().join('\n')).toContain('SEARCH v USING PRIMARY KEY (sighting_id=?)')
  expect(plans.flat().join('\n')).toContain('claims_by_value (kind=? AND value=?')
  for (const index of ['entries_live_export', 'sightings_visible_export']) {
    const missing = fixture()
    missing.raw.exec(`DROP INDEX ${index}`)
    await expect(exportPage(missing.db, 0, 10)).rejects.toThrow()
  }
})

test('font downloads read current visible records and the deployed styles', async () => {
  const { db, raw } = fixture()
  const load = async () => {
    const response = await fontExport({ platform: { env: { DB: db } } } as any)
    expect(response.headers.get('cache-control')).toBe('no-store')
    return await response.json() as { records: { id: number; ids: string | null; layout: string | null; cover_key: string | null; marked_sighting: number | null }[]; styles: { style: string; version: string; adjustedVersion?: string }[] }
  }
  raw.exec(`UPDATE entries SET cover_key = 'thumb' WHERE id = 3;
    INSERT INTO sightings(id, entry_id, first_entry, place, created_by, created_at, updated_at)
    VALUES(999, 3, 3, 'book', 'p', '2026', '2026');
    INSERT INTO sighting_media VALUES(999, 0, 'image', 'image/png', 30, 40, 'thumb', NULL)`)
  expect((await load()).records[1].marked_sighting).toBeNull()
  raw.exec("UPDATE sighting_media SET box = '[[1,2,3,4]]' WHERE sighting_id = 999")
  expect((await load()).records[1].marked_sighting).toBe(999)
  raw.exec("UPDATE sightings SET hidden_at = '2026' WHERE id = 999")
  const first = await load()
  expect(first.records[1].marked_sighting).toBeNull()
  expect(first.records.map(row => row.id)).toEqual([1, 3])
  expect(first.styles.map(face => face.style)).toEqual([...GLYPH_STYLES])
  expect(first.styles[0]).toMatchObject({ style: 'sans', version: composerDrawing('sans'), adjustedVersion: composerDrawing('sans', true) })
  expect(first.styles[0].version).not.toBe(first.styles[0].adjustedVersion)
  expect(first.styles.filter(face => face.adjustedVersion)).toHaveLength(1)
  raw.exec("UPDATE entries SET merged_into = 1 WHERE id = 3; UPDATE entries SET ids = '⿱木木' WHERE id = 1")
  expect((await load()).records).toEqual([{ id: 1, ids: '⿱木木', layout: null, cover_key: null, marked_sighting: null }])
})
