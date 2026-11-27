import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { addComment, commentsOf } from '$lib/server/comments'
import { createPerson } from '$lib/server/people'
import { addSighting, createEntry, editEntry, getEntry, globalHistory, history, list, moveSighting, openReports, redactRevision, report, setHidden, splitSighting, type SightingFields } from '$lib/server/entries'
import { notificationsOf } from '$lib/server/notifications'
import { openTestDb } from '$lib/server/testdb'
import { load as loadHistory } from '../../../history/+page.server'
import { actions, load } from './+page.server'

const seen = (place: string, original_date: string | null = null) => ({ place, url: null, title: null, container: null, source_kind: null, author: null, publisher: null, report_date: null, vias: [], original_date, page: null, contexts: null, style: null, types: null, quotes: null, note: null }) as SightingFields
const fields = (claims: Claim[] = []) => ({ radical: null, strokes: null, claims, description: null })

async function fixture() {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const other = { actor: (await createPerson(db)).id, ip: null }
  const a = await createEntry(db, fields([newClaim('ids', '⿰木木')]), seen('A one', '1921'), [], who)
  const s = (await addSighting(db, a, seen('A two', '1500'), [], other))!
  const first = (await getEntry(db, a))!.sightings[0].id
  const event = (form: Record<string, string | string[]> = {}, sighting: number | string = s, entry: number | string = a) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(form)) for (const item of [value].flat()) data.append(name, item)
    return {
      request: { formData: async () => data }, url: new URL(`https://example.test/en/entry/${entry}/sighting/${sighting}/split`),
      params: { locale: 'en', id: String(entry), sighting: String(sighting) }, locals: { person: null }, platform: { env: { DB: db } },
      cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
    } as any
  }
  const count = (table: string) => (raw.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  const rows = async (entry: number) => ((await loadHistory(event({}, s, entry))) as any).rows as any[]
  const agree = async () => {
    const shown: Record<string, number> = {}
    for (const row of (await globalHistory(db)).rows) shown[row.by_id] = (shown[row.by_id] ?? 0) + 1
    expect(Object.fromEntries((raw.query('SELECT id, changes FROM people WHERE changes <> 0').all() as { id: string; changes: number }[]).map(row => [row.id, row.changes]))).toEqual(shown)
  }
  return { db, raw, who, other, a, s, first, event, count, rows, agree }
}

test('splitting makes a record of the evidence with the number that follows, and both histories say so', async () => {
  const { db, a, s, first, event, rows, agree, count } = await fixture()
  expect(await load(event())).toMatchObject({ id: a, only: false, sighting: { id: s, place: 'A two' } })
  // A form that a record states already goes there, the first record's own too, and one left undescribed is ticked.
  expect(await actions.default(event({ rev: '1', ids: '⿰木木' }))).toMatchObject({ status: 409, data: { error: 'same', described: a } })
  expect(await actions.default(event({ rev: '1' }))).toMatchObject({ status: 400, data: { error: 'undescribed' } })
  expect(await actions.default(event({ rev: '1', ids: '⿱木' }))).toMatchObject({ status: 400, data: { error: 'undescribed' } })
  await expect(actions.default(event({ rev: '1', ids: '⿱木木', summary: ' another form ' }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${a + 1}#sighting-${s}` })
  const made = (await getEntry(db, a + 1))!
  expect(made.entry).toMatchObject({ rev: 1, ids: '⿱木木', sightings: 1, first_year: '1500', first_sighting: s })
  expect(made.sightings.map(x => [x.id, x.first_entry])).toEqual([[s, a + 1]])
  expect((await getEntry(db, a))!.sightings.map(x => x.id)).toEqual([first])
  const tiles = (await list(db, {}))!.tiles
  expect(tiles.map(x => [x.id, x.sightings, x.firstYear]).sort()).toEqual([[a, 1, '1921'], [a + 1, 1, '1500']])
  expect((await list(db, { query: '⿱木木' }))!.tiles.map(x => x.id)).toEqual([a + 1])
  expect((await rows(a))[0]).toMatchObject({ kind: 'move', moved: { sighting: s, to: a + 1 }, summary: 'another form' })
  expect((await rows(a + 1)).map(row => [row.kind, row.moved ?? null])).toEqual([['create', { sighting: s, from: a }], ['sighting', null]])
  await agree()
  // The next record takes the next number, and moving back is a move like any other.
  const next = await createEntry(db, fields(), seen('Next'), [], { actor: (await createPerson(db)).id, ip: null })
  expect(next).toBe(a + 2)
  expect(await addSighting(db, a + 1, seen('More'), [], { actor: (await createPerson(db)).id, ip: null })).toBeTruthy()
  expect(await moveSighting(db, a + 1, s, 1, a, { actor: (await createPerson(db)).id, ip: null }, null)).toBe('done')
  expect((await getEntry(db, a))!.sightings.map(x => [x.id, x.first_entry])).toEqual([[first, a], [s, a]])
  await agree()
  expect(count('entries')).toBe(3)
  // Now ⿱木木 has a record, and a second split of that form is sent there.
  const again = (await addSighting(db, a, seen('A three'), [], { actor: (await createPerson(db)).id, ip: null }))!
  expect(await actions.default(event({ rev: '1', ids: '⿱木木' }, again))).toMatchObject({ status: 409, data: { error: 'described', described: a + 1 } })
  expect(await splitSighting(db, a, again, 1, fields([newClaim('encoding', 'U+6797', { charset: 'unicode' })]), { actor: (await createPerson(db)).id, ip: null }, null)).toMatchObject({ id: a + 3 })
  expect(await splitSighting(db, a + 3, again, 1, fields([newClaim('encoding', 'u+6797 林', { charset: 'unicode' })]), { actor: (await createPerson(db)).id, ip: null }, null)).toEqual({ described: a + 3 })
  expect(count('entries')).toBe(4)
})

test('what rests on the evidence alone goes to the new record, beside what the form states of it', async () => {
  const { db, raw, a, s, first, who } = await fixture()
  const meaning = { ...newClaim('meaning', 'a fish'), sightings: [s] }, reading = { ...newClaim('reading', 'sou'), sightings: [s], under: [meaning.key] }
  await editEntry(db, a, 1, fields([newClaim('ids', '⿰木木'), meaning, reading, { ...newClaim('reading', 'bak6'), sightings: [first, s] }]), who, null)
  const result = await splitSighting(db, a, s, 1, fields([{ ...newClaim('ids', '⿱木木'), sightings: [1] }, newClaim('tag', '合字')]), who, null)
  const id = (result as { id: number }).id
  const claims = (await getEntry(db, id))!.claims
  expect(claims.map(c => [c.kind, c.value, c.sightings, c.under.map(key => claims.find(x => x.key === key)!.value)])).toEqual([['ids', '⿱木木', [], []], ['meaning', 'a fish', [s], []], ['reading', 'sou', [s], ['a fish']], ['reading', 'bak6', [s], []]])
  expect((await getEntry(db, a))!.claims.map(c => [c.value, c.sightings])).toEqual([['⿰木木', []], ['bak6', [first]]])
  expect(raw.query("SELECT count(*) AS n FROM tag_counts WHERE tag = 't:合字'").get()).toEqual({ n: 0 })
})

test('a split that cannot be made makes no record', async () => {
  const { db, raw, a, s, first, who, event, count } = await fixture()
  expect(await actions.default(event({ rev: '9', ids: '⿱木木' }))).toMatchObject({ status: 409, data: { error: 'conflict' } })
  expect(await actions.default(event({ ids: '⿱木木' }))).toMatchObject({ status: 409 })
  expect(await actions.default(event({ rev: '1', ids: 'x'.repeat(3000) }))).toMatchObject({ status: 400 })
  for (const bad of [event({ rev: '1', undescribed: '1' }, 99), event({ rev: '1', undescribed: '1' }, 'x'), event({ rev: '1', undescribed: '1' }, s, 99)]) await expect(actions.default(bad)).rejects.toMatchObject({ status: 404 })
  // Nothing is made for a split that is refused, not even a tag.
  expect(await splitSighting(db, a, s, 9, fields([newClaim('tag', 'ghost')]), who, null)).toBe('conflict')
  expect(raw.query("SELECT count(*) AS n FROM tags WHERE name = 'ghost'").get()).toEqual({ n: 0 })
  expect(await splitSighting(db, a, s, 1, fields([newClaim('ids', '⿱林木'), newClaim('tag', 'ghost')]), who, null)).toEqual({ id: a + 1 })
  expect((await getEntry(db, a + 1))!.claims.map(c => c.kind)).toEqual(['ids'])
  expect(raw.query("SELECT count(*) AS n FROM tags WHERE name = 'ghost'").get()).toEqual({ n: 0 })
  expect(await load(event({}, first))).toMatchObject({ only: true })
  expect(await splitSighting(db, a, first, 1, fields(), who, null)).toBe('only')
  await setHidden(db, { entry: a }, true, who, null)
  await expect(load(event({}, first))).rejects.toMatchObject({ status: 404 })
  expect(await splitSighting(db, a, first, 1, fields(), who, null)).toBe('missing')
  expect(count('entries')).toBe(2)
})

test('a record made meanwhile keeps its number, and the split takes the one after', async () => {
  const { db, a, s, who, count, agree } = await fixture()
  const batch = db.batch.bind(db)
  let raced = false
  db.batch = async statements => {
    if (!raced && statements.some(statement => (statement as unknown as { sql: string }).sql.startsWith('INSERT INTO entries(id, rev'))) {
      raced = true
      expect(await createEntry(db, fields(), seen('Meanwhile'), [], who)).toBe(a + 1)
    }
    return batch(statements)
  }
  expect(await splitSighting(db, a, s, 1, fields([newClaim('ids', '⿱木木')]), who, null)).toEqual({ id: a + 2 })
  expect(raced).toBe(true)
  expect(count('entries')).toBe(3)
  expect((await getEntry(db, a + 1))!.sightings.map(x => x.place)).toEqual(['Meanwhile'])
  expect((await getEntry(db, a + 2))!.sightings.map(x => x.id)).toEqual([s])
  await agree()
})

test('a split that keeps losing its number is a conflict, and makes nothing', async () => {
  const { db, a, s, who, count } = await fixture()
  const batch = db.batch.bind(db)
  let made = 0
  db.batch = async statements => {
    if (statements.some(statement => (statement as unknown as { sql: string }).sql.startsWith('INSERT INTO entries(id, rev'))) { made++; await createEntry(db, fields(), seen('Meanwhile'), [], who) }
    return batch(statements)
  }
  expect(await splitSighting(db, a, s, 1, fields(), who, null)).toBe('conflict')
  expect(made).toBe(5)
  expect(count('entries')).toBe(1 + made)
  expect((await getEntry(db, a))!.sightings.map(x => x.id)).toContain(s)
})

test('two people splitting the same evidence make one record', async () => {
  const { db, a, s, who, other, count } = await fixture()
  const results = await Promise.all([splitSighting(db, a, s, 1, fields(), who, null), splitSighting(db, a, s, 1, fields(), other, null)])
  expect(results.filter(result => typeof result === 'object')).toEqual([{ id: a + 1 }])
  expect(results.filter(result => typeof result === 'string')).toEqual(['missing'])
  expect(count('entries')).toBe(2)
})

test('comments, reports and notices follow, and a redacted split still says where the evidence came from', async () => {
  const { db, a, s, who, other, rows } = await fixture()
  const third = { actor: (await createPerson(db)).id, ip: null }
  await addComment(db, { entry: a, sighting: s }, 'another form?', third)
  await report(db, { entry: a, sighting: s }, 'private', third.actor)
  const { id } = await splitSighting(db, a, s, 1, fields([newClaim('ids', '⿱木木')]), third, 'a private reason') as { id: number }
  expect((await commentsOf(db, id)).map(c => c.body)).toEqual(['another form?'])
  expect((await openReports(db, 0)).reports[0]).toMatchObject({ entry_id: id, sighting_id: s })
  // Both the recorder of the record and the recorder of the evidence are told.
  for (const person of [who, other]) expect((await notificationsOf(db, person.actor)).notifications.filter(n => n.text === 'a private reason')).toHaveLength(1)
  await editEntry(db, id, 1, { ...fields((await getEntry(db, id))!.claims), description: 'later' }, third, null)
  const made = (await history(db, id)).find(row => row.kind === 'create')!
  expect(await redactRevision(db, id, made.id, third, null)).toBe(true)
  expect((await rows(id)).find(row => row.id === made.id)).toMatchObject({ kind: 'create', moved: { sighting: s, from: a }, summary: null, fields: null, redacted: true })
})
