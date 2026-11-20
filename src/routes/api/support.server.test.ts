import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { GET as match } from './match/+server'
import { GET as exportEntries } from './entries/+server'

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id,name,created_at) VALUES('a','anon','2026-01-01');
    INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(1,'han','⿰亻木','a','2026','2026'),(2,'han','⿰亻木','a','2026','2026');
    INSERT INTO sightings(entry_id,first_entry,place,created_by,created_at,updated_at) VALUES(1,1,'=formula','a','2026','2026');
    INSERT INTO claims(entry_id,position,key,kind,value) VALUES(1,0,'ids00001','ids','⿰亻木'),(2,0,'ids00002','ids','⿰亻木');`)
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

test('match finds the visible records that carry a Unicode code', async () => {
  const { raw, event } = fixture()
  raw.exec(`INSERT INTO claims(entry_id,position,key,kind,value,data) VALUES(1,1,'enc00001','encoding','U+4F11','{"charset":"unicode"}'),(2,1,'enc00002','encoding','U+4F11','{"charset":"unicode"}'),(1,2,'enc00003','encoding','U+4F11','{"charset":"other"}');
    INSERT INTO entries(id,script,ids,created_by,created_at,updated_at) VALUES(3,'han','⿰亻木','a','2026','2026'),(4,'han','⿰亻木','a','2026','2026'),(5,'han','⿰亻木','a','2026','2026');
    INSERT INTO claims(entry_id,position,key,kind,value,data) VALUES(3,0,'enc00004','encoding','u+4f11 休','{"charset":"unicode"}'),(4,0,'enc00005','encoding','U+4F11A','{"charset":"unicode"}'),(5,0,'enc00006','encoding','U+4F11','{"charset":"gb"}');
    UPDATE entries SET hidden_at = '2026' WHERE id = 2`)
  expect(((await (await match(event('/api/match?code=U%2B4F11'))).json()) as { id: number }[]).map(r => r.id)).toEqual([1, 3])
  expect(await (await match(event('/api/match?code=U%2B6797'))).json()).toEqual([])
  expect((await match(event('/api/match?code=4F11'))).status).toBe(400)
})

test('export pages JSON and escapes CSV cells', async () => {
  const { event, raw } = fixture()
  const data = { relationship: 'variant', difference: 'extra stroke', evidence: 'source' }
  raw.prepare("INSERT INTO claims(entry_id, position, key, kind, value, data) VALUES (1, 1, 'rela0001', 'relation', '木', ?)").run(JSON.stringify(data))
  const response = await exportEntries(event('/api/entries?limit=1'))
  const body = await response.json() as { entries: { id: number; evidence: unknown[]; claims: unknown[] }[]; next: number | null }
  expect(body.entries[0].claims).toEqual([{ key: 'ids00001', kind: 'ids', value: '⿰亻木', data: null, sightings: [], under: [] }, { key: 'rela0001', kind: 'relation', value: '木', data, sightings: [], under: [] }])
  expect(body.entries).toHaveLength(1)
  expect(body.entries[0].evidence).toHaveLength(1)
  expect(body.next).toBe(1)
  expect(response.headers.get('link')).toContain('after=1')
  const csv = await (await exportEntries(event('/api/entries?format=csv'))).text()
  expect(csv).toContain('"\'=formula"')
  const header = csv.split('\r\n')[0]
  expect(header).not.toContain('record_code')
  expect(header).not.toContain('created_by_name')
  const second = await (await exportEntries(event('/api/entries?after=1'))).json() as { entries: { id: number }[] }
  expect(second.entries[0].id).toBe(2)
  expect(exportEntries(event('/api/entries?limit=201'))).rejects.toMatchObject({ status: 400 })
})
