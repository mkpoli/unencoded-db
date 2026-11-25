import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { ALIKE_PAGE, PAIRS_MAX, formsStatement, membersStatement, parseAlikeCursor, statedStatement } from '$lib/server/alike'
import { recordCode } from '$lib/code'
import { createEntry, editEntry, mergeEntry, setHidden, unmergeEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const fields = (claims: Claim[], script = 'han'): EntryFields => ({ script, script_other: null, description: null, radical: null, strokes: null, claims })
const seen = { place: 'A shop', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, note: null, quotes: null } as SightingFields

async function fixture() {
  const { db, raw } = openTestDb()
  const person = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const add = (ids: string | string[], script?: string) => createEntry(db, fields([ids].flat().map(value => newClaim('ids', value)), script), seen, [], who)
  const open = async (query = '') => await load({ url: new URL(`https://example.test/en/duplicates${query}`), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db } } } as never) as { groups: { ids: string[]; same: boolean; records: { id: number; script: string }[]; pairs: [number, number][] }[]; next: string | null }
  const listed = async () => (await open()).groups.map(group => [group.ids.join(' '), group.same, group.records.map(record => record.id)])
  const relate = (id: number, rev: number, ids: string, value: string) => editEntry(db, id, rev, fields([newClaim('ids', ids), { ...newClaim('relation', value), data: { relationship: 'glyph' } } as Claim]), who, null)
  return { db, raw, who, add, open, listed, relate }
}

test('records of one form are listed, the form with the latest record first, whatever their scripts', async () => {
  const { add, open, listed } = await fixture()
  await add('⿱赤相'); await add('⿰王甲'); await add('⿱赤相', 'miao'); await add('⿰木木'); await add('⿰壬甲'); await add('⿱？木'); await add('⿱？木')
  expect(await listed()).toEqual([['⿰王甲 ⿰壬甲', false, [2, 5]], ['⿱赤相', true, [1, 3]]])
  const [, group] = (await open()).groups
  expect([group.records.map(record => record.script), group.pairs]).toEqual([['han', 'miao'], [[1, 3]]])
})

test('a merge takes the pair off the list and its undo brings it back', async () => {
  const { db, add, listed, who } = await fixture()
  await add('⿱赤相'); await add('⿱赤相')
  await mergeEntry(db, 2, 1, who, null)
  expect(await listed()).toEqual([])
  await unmergeEntry(db, 2, who)
  expect(await listed()).toEqual([['⿱赤相', true, [1, 2]]])
})

test('a relation that names the other record takes the pair off the list', async () => {
  const { add, listed, open, relate } = await fixture()
  await add('⿱赤相'); await add('⿱赤相')
  await relate(1, 1, '⿱赤相', '赤')
  expect(await listed()).toHaveLength(1)
  await relate(1, 2, '⿱赤相', 'R+0002')
  expect(await listed()).toEqual([])
  // A third record is undecided with both.
  await add('⿱赤相')
  expect((await open()).groups[0].pairs).toEqual([[1, 3], [2, 3]])
  await relate(3, 1, '⿱赤相', 'R+0001')
  const [group] = (await open()).groups
  expect([group.pairs, group.records.map(record => record.id)]).toEqual([[[2, 3]], [2, 3]])
})

test('a record stays listed however many earlier ones are decided among themselves', async () => {
  const { raw, add, open } = await fixture()
  for (let n = 0; n < PAIRS_MAX + 2; n++) await add('⿱赤相')
  const last = PAIRS_MAX + 2
  for (let a = 1; a < last; a++) for (let b = a + 1; b < last; b++) raw.prepare("INSERT INTO claims(entry_id, position, key, kind, value) VALUES (?, ?, ?, 'relation', ?)").run(a, b, `key${b}`, recordCode(b))
  const [group] = (await open()).groups
  expect(group.pairs).toEqual(Array.from({ length: PAIRS_MAX }, (_, index) => [index + 1, last]))
  expect(group.records.at(-1)!.id).toBe(last)
})

test('a hidden record and a description edited away are left out, and the counts follow', async () => {
  const { db, raw, add, listed, who } = await fixture()
  await add('⿱赤相'); await add(['⿱赤相', '⿰木木'])
  await setHidden(db, { entry: 2 }, true, who, null)
  expect(await listed()).toEqual([])
  await setHidden(db, { entry: 2 }, false, who, null)
  expect(await listed()).toHaveLength(1)
  await editEntry(db, 2, 1, fields([newClaim('ids', '⿰木木')]), who, null)
  expect(await listed()).toEqual([])
  expect(raw.query('SELECT form, n, latest FROM form_counts ORDER BY form').all()).toEqual(raw.query('SELECT form, COUNT(*) AS n, MAX(entry_id) AS latest FROM forms GROUP BY form ORDER BY form').all())
})

test('the list is paged without a gap', async () => {
  const { add, open } = await fixture()
  const parts = [...'一丁七万丈三上下不与丐丑专且世丘丙业丛东丝丞丢两严丧个中丰串临丸丹为主']
  for (const part of parts.slice(0, ALIKE_PAGE + 3)) for (let n = 0; n < 2; n++) await add(`⿰木${part}`)
  const first = await open(), second = await open(`?after=${first.next}`)
  expect([first.groups.length, second.groups.length, second.next]).toEqual([ALIKE_PAGE, 3, null])
  expect(new Set([...first.groups, ...second.groups].map(group => group.ids[0])).size).toBe(ALIKE_PAGE + 3)
  for (const after of ['', 'x', '1', '0.1', '1.2.3']) await expect(open(`?after=${after}`)).rejects.toMatchObject({ status: 404 })
  expect(parseAlikeCursor('12.3')).toEqual({ latest: 12, id: 3 })
})

test('each read is a range of an index', async () => {
  const { db, raw } = await fixture()
  for (const statement of [formsStatement(db, null), formsStatement(db, { latest: 5, id: 1 }), membersStatement(db, ['a']), statedStatement(db, [1])]) {
    const { sql, values } = statement as unknown as { sql: string; values: unknown[] }
    const details = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
    expect(details.join('\n')).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!j VIRTUAL|.*USING)/)
    expect(details.join('\n')).toMatch(/form_counts_alike|USING (COVERING )?INDEX|PRIMARY KEY/)
  }
})
