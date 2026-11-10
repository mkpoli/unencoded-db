import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { GET as match } from './match/+server'
import { GET as exportEntries } from './entries/+server'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id,name,created_at) VALUES('a','anon','2026-01-01');
    INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(1,'han','⿰亻木','a','2026','2026'),(2,'han','⿰亻木','a','2026','2026');
    INSERT INTO sightings(entry_id,first_entry,place,created_by,created_at,updated_at) VALUES(1,1,'=formula','a','2026','2026');`)
  const event = (path: string) => ({ url: new URL(path, 'https://example.test'), platform: { env: { DB: db } } }) as any
  return { raw, event }
}

test('match normalizes IDS and excludes hidden records', async () => {
  const { raw, event } = fixture()
  raw.exec("UPDATE entries SET hidden_at = '2026' WHERE id = 2")
  const response = await match(event('/api/match?ids=%E2%BF%B0%E4%BA%BB%20%E6%9C%A8'))
  expect(((await response.json()) as { id: number }[]).map(r => r.id)).toEqual([1])
  expect(await (await match(event('/api/match'))).json()).toEqual([])
})

test('export pages JSON and escapes CSV cells', async () => {
  const { event, raw } = fixture()
  const comparison = [{ character: '木', relationship: 'variant', difference: 'extra stroke', evidence: 'source' }]
  raw.prepare('UPDATE entries SET related_characters = ? WHERE id = 1').run(JSON.stringify(comparison))
  const response = await exportEntries(event('/api/entries?limit=1'))
  const body = await response.json() as { entries: { id: number; evidence: unknown[]; related_characters: unknown[] }[]; next: number | null }
  expect(body.entries[0].related_characters).toEqual(comparison)
  expect(body.entries).toHaveLength(1)
  expect(body.entries[0].evidence).toHaveLength(1)
  expect(body.next).toBe(1)
  expect(response.headers.get('link')).toContain('after=1')
  const csv = await (await exportEntries(event('/api/entries?format=csv'))).text()
  expect(csv).toContain('"\'=formula"')
  const second = await (await exportEntries(event('/api/entries?after=1'))).json() as { entries: { id: number }[] }
  expect(second.entries[0].id).toBe(2)
  expect(exportEntries(event('/api/entries?limit=201'))).rejects.toMatchObject({ status: 400 })
})
