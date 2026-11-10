import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { exportPage, sameIds } from '$lib/server/entries'
import { GET as exportGet } from './entries/+server'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  const entry = raw.prepare("INSERT INTO entries(script, ids, created_by, created_at, updated_at, hidden_at) VALUES ('han', ?, 'p', '2026', '2026', ?)")
  entry.run('⿰亻木', null)
  entry.run('⿰亻木', 'hidden')
  entry.run('⿰亻木', null)
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

test('export gives source types as a list in JSON and a readable cell in CSV', async () => {
  const { db, raw } = fixture()
  raw.prepare("UPDATE sightings SET types = ? WHERE entry_id = 1 AND place = 'source 0'").run(JSON.stringify(['mention', 'definition']))
  const jsonResponse = await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=json'), platform: { env: { DB: db } } } as any)
  const body = await jsonResponse.json() as any
  expect(body.entries[0].evidence[0].types).toEqual(['mention', 'definition'])
  const csvResponse = await exportGet({ url: new URL('https://example.test/api/entries?limit=5&format=csv'), platform: { env: { DB: db } } } as any)
  expect(await csvResponse.text()).toContain('"mention, definition"')
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
    expect(plan.join('\n')).not.toMatch(/USE TEMP B-TREE FOR ORDER BY|SCAN (?:e|s|entries|sightings)(?:\s|$)/)
  }
  expect(plans.flat().join('\n')).toContain('entries_live_export')
  expect(plans.flat().join('\n')).toContain('sightings_visible_export')
  expect(plans.flat().join('\n')).toContain('entries_live_ids')
  for (const index of ['entries_live_export', 'sightings_visible_export', 'entries_live_ids']) {
    const missing = fixture()
    missing.raw.exec(`DROP INDEX ${index}`)
    if (index === 'entries_live_ids') await expect(sameIds(missing.db, '⿰亻木')).rejects.toThrow()
    else await expect(exportPage(missing.db, 0, 10)).rejects.toThrow()
  }
})
