import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { descriptionsStatement, loadStatement, spellings, spellingStatement, SPELLINGS_MAX } from '$lib/server/candidates'
import { partsOf, sameIds } from '$lib/server/entries'
import { GET as candidates } from './candidates/+server'

const records: [number, string, string | null][] = [
  [1, '⿰亻木', null], [2, '⿰亻水', null], [3, '⿱山水', null], [4, '⿰亻木', 'hidden'], [5, '⿰壬木', null], [6, '⿰女子', null], [7, '⿰亻休', null],
]

function fixture() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('a', 'anon', '2026')")
  const entry = raw.prepare("INSERT INTO entries(id, script, ids, layout, created_by, created_at, updated_at, hidden_at, merged_into) VALUES (?, 'han', ?, ?, 'a', '2026', '2026', ?, ?)")
  const claim = raw.prepare("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (?, 0, ?, 'ids', ?)")
  const tag = raw.prepare('INSERT INTO entry_tags(tag, entry_id) VALUES (?, ?)')
  for (const [id, ids, hidden] of records) {
    entry.run(id, ids, id === 1 ? '{"x":1}' : null, hidden, id === 7 ? 1 : null)
    claim.run(id, `ids${id}`, ids)
    for (const part of partsOf(ids)) tag.run(`p:${part}`, id)
  }
  const event = (path: string) => ({ url: new URL(path, 'https://example.test'), platform: { env: { DB: db } } }) as any
  return { db, raw, event }
}

const ask = async (event: (path: string) => unknown, query: string) => ((await (await candidates(event(`/api/candidates?${query}`) as never)).json()) as { id: number; ids: string; layout: string | null; cover_key: string | null; descriptions: string[]; exact: boolean }[])

const q = (ids: string, leaves = '') => `ids=${encodeURIComponent(ids)}${leaves ? `&leaves=${encodeURIComponent(leaves)}` : ''}`

test('records sharing a part come back, exact ones first, without hidden or merged records', async () => {
  const { event } = fixture()
  const found = await ask(event, q('⿰亻木'))
  expect(found.map(record => record.id)).toEqual([1, 5, 2])
  expect(found[0]).toEqual({ id: 1, ids: '⿰亻木', layout: '{"x":1}', cover_key: null, descriptions: ['⿰亻木'], exact: true })
  expect(found.slice(1).map(record => record.exact)).toEqual([false, false])
})

test('a record that shares more parts comes before one that shares fewer, after the exact ones', async () => {
  const { event, raw } = fixture()
  raw.exec("INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (8, 'han', '⿱亻⿰木木', 'a', '2026', '2026'); INSERT INTO entry_tags(tag, entry_id) VALUES ('p:亻', 8), ('p:木', 8)")
  expect((await ask(event, q('⿰亻木'))).map(record => record.id)).toEqual([1, 8, 5, 2])
})

test('the expansion leaves and the IWDS group mates of a part are read too', async () => {
  const { event } = fixture()
  expect((await ask(event, q('⿰好看', '女'))).map(record => record.id)).toEqual([6])
  expect((await ask(event, q('⿰王木'))).map(record => record.id)).toEqual([5, 1])
})

test('a record comes with every description it states, and is exact by any of them', async () => {
  const { event, raw } = fixture()
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (2, 1, 'ids2b', 'ids', '⿰人水'), (2, 2, 'ids2c', 'ids', '⿰氵人')")
  const found = await ask(event, q('⿰人水'))
  expect(found[0]).toMatchObject({ id: 2, exact: true, descriptions: ['⿰亻水', '⿰人水', '⿰氵人'] })
})

test('each part reads the newest records first', async () => {
  const { event, raw } = fixture()
  const entry = raw.prepare("INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (?, 'han', '⿰亥亥', 'a', '2026', '2026')")
  const tag = raw.prepare("INSERT INTO entry_tags(tag, entry_id) VALUES ('p:亥', ?)")
  for (let id = 100; id < 400; id++) { entry.run(id); tag.run(id) }
  const found = await ask(event, q('⿰亥木'))
  expect(found.map(record => record.id).filter(id => id >= 100)).toContain(399)
  expect(found.map(record => record.id)).not.toContain(100)
})

test('a short or oversized query answers nothing', async () => {
  const { event } = fixture()
  expect(await ask(event, 'ids=木')).toEqual([])
  expect((await candidates(event(`/api/candidates?ids=${'木'.repeat(300)}`) as never)).status).toBe(400)
})

test('at most the cap of spellings is read, parts as written first', () => {
  const ids = '⿰' + '⿰'.repeat(20) + [...'一二三四五六七八九十甲乙丙丁'].join('')
  expect(spellings(ids, ['女', '子']).length).toBeLessThanOrEqual(SPELLINGS_MAX)
  expect(spellings('⿰王木')).toEqual(expect.arrayContaining(['p:王', 'p:木', 'p:壬']))
  expect(spellings('⿰王木')[0]).toBe('p:王')
  expect(spellings('⿰⺅木')).toEqual(expect.arrayContaining(['p:亻', 'p:木']))
  expect(spellings('⿰⺅木')).not.toContain('p:⺅')
})

// One range of the primary key per spelling, a lookup by key per record, and the exact match on its index.
test('the reads use their indexes and no temporary sort', async () => {
  const { db, raw } = fixture()
  const plan = (statement: unknown) => { const { sql, values } = statement as { sql: string; values: unknown[] }; return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail) }
  const plans = [plan(spellingStatement(db, 'p:木')), plan(loadStatement(db, [1, 2, 3])), ...await tracedSame(db, raw), plan(descriptionsStatement(db, [1, 2, 3]))]
  for (const details of plans) {
    expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!.*USING)/)
  }
  expect(plans[0].join('\n')).toMatch(/SEARCH entry_tags USING PRIMARY KEY \(tag=\?\)/)
  expect(plans[1].join('\n')).toMatch(/SEARCH entries USING INTEGER PRIMARY KEY \(rowid=\?\)/)
  expect(plans[2].join('\n')).toContain('claims_by_value (kind=? AND value=?')
  expect(plans.at(-1)!.join('\n')).toMatch(/SEARCH claims USING INDEX claims_by_entry \(entry_id=\?\)/)
})

test('without the key on the tag and record the part read scans the rows', () => {
  const { db, raw } = fixture()
  raw.exec('CREATE TABLE entry_tags_bare(tag TEXT NOT NULL, entry_id INTEGER NOT NULL)')
  const { sql, values } = spellingStatement(db, 'p:木') as unknown as { sql: string; values: unknown[] }
  const details = (raw.query(`EXPLAIN QUERY PLAN ${sql.replace('entry_tags', 'entry_tags_bare')}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(details).toMatch(/SCAN entry_tags_bare|TEMP B-TREE/)
})

test('without its index the exact match scans the claims', async () => {
  const { db, raw } = fixture()
  raw.exec('DROP INDEX claims_by_value')
  expect((await tracedSame(db, raw))[0].join('\n')).toMatch(/SCAN (k|claims)\b/)
})

async function tracedSame(db: D1Database, raw: ReturnType<typeof openTestDb>['raw']) {
  const plans: string[][] = []
  const traced = { prepare(sql: string) {
    const stmt = db.prepare(sql)
    return { bind(...values: unknown[]) {
      plans.push((raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]) as { detail: string }[]).map(row => row.detail))
      return stmt.bind(...values)
    } }
  } } as D1Database
  await sameIds(traced, '⿰亻木')
  return plans
}
