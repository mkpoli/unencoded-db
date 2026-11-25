import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { addComment, commentsOf } from '$lib/server/comments'
import { createPerson } from '$lib/server/people'
import { addSighting, createEntry, editEntry, editSighting, getEntry, globalHistory, history, list, mergeEntry, moveSighting, openReports, redactRevision, removeSighting, report, setHidden, sourceList, unmergeEntry, type SightingFields } from '$lib/server/entries'
import { notificationsOf } from '$lib/server/notifications'
import { openTestDb } from '$lib/server/testdb'
import { load as loadHistory } from '../../../history/+page.server'
import { actions, load } from './+page.server'

const seen = (place: string, original_date: string | null = null, title: string | null = null) => ({ place, url: null, title, container: null, source_kind: null, author: null, publisher: null, report_date: null, vias: [], original_date, page: null, contexts: null, style: null, types: null, quotes: null, note: null }) as SightingFields
const fields = (claims: Claim[] = []) => ({ script: 'han' as const, script_other: null, radical: null, strokes: null, claims, description: null })

async function fixture() {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const other = { actor: (await createPerson(db)).id, ip: null }
  const a = await createEntry(db, fields([newClaim('ids', '⿰木木')]), seen('A one', '1921'), [], who)
  const s = (await addSighting(db, a, seen('A two', '1500', 'A book'), [], who))!
  const b = await createEntry(db, fields([newClaim('ids', '⿱木木')]), seen('B one', '1999'), [], other)
  const first = (await getEntry(db, a))!.sightings[0].id
  const event = (form: Record<string, string> = {}, { sighting = s as number | string, entry = a as number | string, to = '' } = {}) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(form)) data.set(name, value)
    return {
      request: { formData: async () => data }, url: new URL(`https://example.test/en/entry/${entry}/sighting/${sighting}/move${to ? `?to=${encodeURIComponent(to)}` : ''}`),
      params: { locale: 'en', id: String(entry), sighting: String(sighting) }, locals: { person: null }, platform: { env: { DB: db } },
      cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
    } as any
  }
  const ids = async (entry: number) => (await getEntry(db, entry))!.sightings.map(x => x.id)
  const claims = async (entry: number) => (await getEntry(db, entry))!.claims.map(c => [c.kind, c.value, c.sightings])
  const rows = async (entry: number) => ((await loadHistory(event({}, { entry }))) as any).rows as any[]
  const tile = async (entry: number) => (await list(db, {}))!.tiles.find(x => x.id === entry)!
  // What each person is counted for is what the feed shows of theirs.
  const agree = async () => {
    const shown: Record<string, number> = {}
    for (const row of (await globalHistory(db)).rows) shown[row.by_id] = (shown[row.by_id] ?? 0) + 1
    expect(Object.fromEntries((raw.query('SELECT id, changes FROM people WHERE changes <> 0').all() as { id: string; changes: number }[]).map(row => [row.id, row.changes]))).toEqual(shown)
  }
  return { db, raw, who, other, a, b, s, first, event, ids, claims, rows, tile, agree }
}

test('moving evidence puts it on the other record with its history, and both records say so', async () => {
  const { db, raw, a, b, s, first, event, ids, rows, tile, agree } = await fixture()
  await editSighting(db, s, 1, seen('A two, edited', '1500', 'A book'), null, { actor: (await createPerson(db)).id, ip: null }, 'typo', a)
  expect(await tile(a)).toMatchObject({ sightings: 2, firstYear: '1500' })
  await agree()
  expect(await load(event({}, { to: `R+${b.toString(16).toUpperCase().padStart(4, '0')}` }))).toMatchObject({ id: a, to: b, only: false, problem: null })
  await expect(actions.default(event({ rev: '2', to: String(b), summary: ' another form ' }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${b}#sighting-${s}` })
  expect(await ids(a)).toEqual([first])
  expect(await ids(b)).toContain(s)
  expect(await tile(a)).toMatchObject({ sightings: 1, firstYear: '1921' })
  expect(await tile(b)).toMatchObject({ sightings: 2, firstYear: '1500' })
  expect((await sourceList(db)).sources.find(source => source.title === 'A book')!.tiles.map(x => x.id)).toEqual([b])
  expect((await rows(a))[0]).toMatchObject({ kind: 'move', moved: { sighting: s, to: b }, summary: 'another form', rev: 2 })
  expect((await rows(b))[0]).toMatchObject({ kind: 'move', moved: { sighting: s, from: a }, rev: 2 })
  // The evidence's own versions went along.
  expect((await rows(b)).filter(row => row.sighting_id === s).map(row => [row.kind, row.sightingFields.place])).toEqual([['sighting_edit', 'A two, edited'], ['sighting', 'A two']])
  expect((await rows(a)).some(row => row.sighting_id === s)).toBe(false)
  expect((await globalHistory(db)).rows.filter(row => row.sighting_id === s).map(row => row.entry_id)).toEqual([b, b])
  await agree()
  // Moving it back is the same move the other way.
  await expect(actions.default(event({ rev: '2', to: String(a) }, { entry: b }))).rejects.toMatchObject({ status: 303 })
  expect(await ids(a)).toEqual([first, s])
  expect((await rows(a)).filter(row => row.sighting_id === s)).toHaveLength(2)
  await agree()
  expect(raw.query('SELECT entry_id, first_entry FROM sightings WHERE id = ?').get(s)).toEqual({ entry_id: a, first_entry: a })
})

test('what rests on the evidence alone goes along, what rests on more is on both, and the form stays described', async () => {
  const { db, a, b, s, first, who, claims } = await fixture()
  const meaning = { ...newClaim('meaning', 'a fish'), sightings: [s] }, reading = { ...newClaim('reading', 'sou'), sightings: [s], under: [meaning.key] }
  const shared = { ...newClaim('reading', 'bak6'), sightings: [first, s] }
  const kept = { ...newClaim('meaning', 'a tree'), sightings: [s] }, under = { ...newClaim('reading', 'rin'), sightings: [first], under: [kept.key] }
  const described = { ...newClaim('ids', '⿰木木'), sightings: [s] }, code = { ...newClaim('encoding', 'U+6797', { charset: 'unicode' }), sightings: [s] }, tag = { ...newClaim('tag', '合字'), sightings: [] }
  expect(await editEntry(db, a, 1, fields([described, meaning, reading, shared, kept, under, code, tag]), who, null)).toMatchObject({ ok: true })
  expect(await moveSighting(db, a, s, 1, b, who, null)).toBe('done')
  expect(await claims(a)).toEqual([['ids', '⿰木木', []], ['reading', 'bak6', [first]], ['meaning', 'a tree', []], ['reading', 'rin', [first]], ['encoding', 'U+6797', []], ['tag', '合字', []]])
  expect((await claims(b)).slice(1)).toEqual(expect.arrayContaining([['meaning', 'a fish', [s]], ['reading', 'sou', [s]], ['reading', 'bak6', [s]], ['meaning', 'a tree', [s]]]))
  expect(await claims(b)).toHaveLength(5)
  expect((await getEntry(db, b))!.claims.find(c => c.value === 'sou')!.under).toEqual([meaning.key])
  expect((await getEntry(db, a))!.claims.find(c => c.value === 'rin')!.under).toEqual([kept.key])
  expect((await list(db, { query: 'sou' }))!.tiles.map(x => x.id)).toEqual([b])
})

test('comments and open reports about the evidence follow it', async () => {
  const { db, a, b, s, who, other } = await fixture()
  await addComment(db, { entry: a, sighting: s }, 'another form?', other)
  await addComment(db, { entry: a, sighting: null }, 'on the record', other)
  await report(db, { entry: a, sighting: s }, 'private', other.actor)
  expect(await moveSighting(db, a, s, 1, b, who, null)).toBe('done')
  expect((await commentsOf(db, a, false)).map(c => c.body)).toEqual(['on the record'])
  expect((await commentsOf(db, b, false)).map(c => c.body)).toEqual(['another form?'])
  expect((await openReports(db, 0)).reports[0]).toMatchObject({ entry_id: b, sighting_id: s, target_hidden_at: null })
  await setHidden(db, { entry: b, sighting: s }, true, other, null)
  expect((await openReports(db, 0)).reports[0].target_hidden_at).not.toBeNull()
})

test('a move that cannot be made is refused and changes nothing', async () => {
  const { db, raw, a, b, s, first, who, event, ids } = await fixture()
  expect(await actions.default(event({ rev: '9', to: String(b) }))).toMatchObject({ status: 409, data: { error: 'conflict' } })
  expect(await actions.default(event({ rev: '1', to: '999' }))).toMatchObject({ status: 400, data: { error: 'missing' } })
  expect(await actions.default(event({ rev: '1', to: 'nonsense' }))).toMatchObject({ status: 400 })
  expect(await actions.default(event({ rev: '1', to: String(a) }))).toMatchObject({ status: 409, data: { error: 'same' } })
  for (const bad of [{ sighting: 99 }, { sighting: 'x' }, { entry: b }]) await expect(actions.default(event({ rev: '1', to: String(b) }, bad))).rejects.toMatchObject({ status: 404 })
  expect(await load(event({}, { to: String(a) }))).toMatchObject({ problem: 'same', pair: null })
  expect(await load(event({}, { to: '999' }))).toMatchObject({ problem: 'missing', pair: null })
  // A record keeps its last evidence; removed evidence is put back before it moves.
  const only = (await getEntry(db, b))!.sightings[0].id
  expect(await load(event({}, { entry: b, sighting: only }))).toMatchObject({ only: true })
  expect(await moveSighting(db, b, only, 1, a, who, null)).toBe('only')
  expect(await removeSighting(db, a, s, 1, who, null)).toBe('done')
  expect(await moveSighting(db, a, s, 1, b, who, null)).toBe('missing')
  expect(await moveSighting(db, a, first, 1, b, who, null)).toBe('only')
  await setHidden(db, { entry: b }, true, who, null)
  expect(await moveSighting(db, a, first, 1, b, who, null)).toBe('missing')
  expect(await ids(a)).toEqual([first, s])
  expect(raw.query(`SELECT count(*) AS n FROM revisions WHERE snapshot LIKE '%"moved"%'`).get()).toEqual({ n: 0 })
})

test('evidence goes to the record a named duplicate was merged into, and a merge can be undone around a move', async () => {
  const { db, a, b, s, first, who, event, ids, claims, rows, agree } = await fixture()
  const dup = await createEntry(db, fields([newClaim('ids', '⿱木木')]), seen('Dup'), [], who)
  const held = (await getEntry(db, dup))!.sightings[0].id
  const more = (await addSighting(db, dup, seen('Dup two'), [], who))!
  const reading = { ...newClaim('reading', 'rin'), sightings: [held] }
  await editEntry(db, dup, 1, fields([newClaim('ids', '⿱木木'), reading]), who, null)
  expect(await mergeEntry(db, dup, b, who, null)).toEqual({ ok: true })
  await expect(actions.default(event({ rev: '1', to: String(dup) }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${b}#sighting-${s}` })
  // The last evidence of either record stays while they are merged, so that undoing it leaves each its own.
  const own = (await getEntry(db, b))!.sightings.find(x => x.place === 'B one')!.id
  expect(await moveSighting(db, b, held, 1, a, who, null)).toBe('done')
  expect(await moveSighting(db, b, more, 1, a, who, null)).toBe('only')
  expect(await load(event({}, { entry: b, sighting: more }))).toMatchObject({ only: true })
  expect(await moveSighting(db, b, s, 1, a, who, null)).toBe('done')
  expect(await moveSighting(db, b, own, 1, a, who, null)).toBe('only')
  expect((await claims(a)).slice(1)).toEqual([['reading', 'rin', [held]]])
  await agree()
  // Moved back, it is the duplicate's again; the other stays where it went.
  expect(await moveSighting(db, a, held, 1, b, who, null)).toBe('done')
  expect(await unmergeEntry(db, dup, who)).toBe(true)
  expect(await ids(dup)).toEqual([held, more])
  expect(await ids(b)).toEqual([own])
  expect(await ids(a)).toEqual([first, s])
  expect((await getEntry(db, a))!.sightings.map(x => x.first_entry)).toEqual([a, a])
  await agree()
  // Undone with the evidence elsewhere, the duplicate's claims no longer rest on it.
  expect(await mergeEntry(db, dup, b, who, null)).toEqual({ ok: true })
  expect(await moveSighting(db, b, held, 1, a, who, null)).toBe('done')
  expect(await unmergeEntry(db, dup, who)).toBe(true)
  expect(await ids(dup)).toEqual([more])
  expect((await claims(dup)).every(([, , rests]) => !(rests as number[]).includes(held))).toBe(true)
  expect((await rows(a)).length).toBeGreaterThan(0)
  await agree()
})

test('moving there and back leaves the other record the claims it had', async () => {
  const { db, a, b, s, first, who, other, claims } = await fixture()
  const fish = { ...newClaim('meaning', 'fish'), sightings: [first] }, tree = { ...newClaim('meaning', 'tree'), sightings: [first] }
  const kan = { ...newClaim('reading', 'kan'), sightings: [s] }, gyo = { ...newClaim('reading', 'gyo'), sightings: [s], under: [fish.key] }, rin = { ...newClaim('reading', 'rin'), sightings: [s], under: [tree.key] }
  const self = { ...newClaim('relation', `R+${b.toString(16).toUpperCase().padStart(4, '0')}`, { relationship: 'variant', difference: null, evidence: null }), sightings: [s] }
  expect(await editEntry(db, a, 1, fields([newClaim('ids', '⿰木木'), fish, tree, kan, gyo, rin, self]), who, null)).toMatchObject({ ok: true })
  expect(await editEntry(db, b, 1, fields([newClaim('ids', '⿱木木'), newClaim('reading', 'kan'), newClaim('reading', 'gyo')]), other, null)).toMatchObject({ ok: true })
  const before = (await getEntry(db, b))!.claims
  expect(await moveSighting(db, a, s, 1, b, who, null)).toBe('done')
  // A reading goes with the meaning it holds under; one the other record gives of itself is not narrowed, and
  // no record is related to itself.
  const there = (await getEntry(db, b))!.claims
  expect(there.map(c => [c.kind, c.value, c.sightings, c.under.map(key => there.find(x => x.key === key)!.value)])).toEqual([
    ['ids', '⿱木木', [], []], ['reading', 'kan', [s], []], ['reading', 'gyo', [], []], ['meaning', 'tree', [], []], ['reading', 'rin', [s], ['tree']]])
  const here = (await getEntry(db, a))!.claims
  expect(here.map(c => [c.kind, c.value, c.sightings, c.under.map(key => here.find(x => x.key === key)!.value)])).toEqual([
    ['ids', '⿰木木', [], []], ['meaning', 'fish', [first], []], ['meaning', 'tree', [first], []], ['reading', 'gyo', [], ['fish']], ['relation', self.value, [], []]])
  expect(await moveSighting(db, b, s, 1, a, who, null)).toBe('done')
  expect((await getEntry(db, b))!.claims).toEqual(before)
  const back = (await getEntry(db, a))!.claims
  expect(back.filter(c => c.sightings.includes(s)).map(c => [c.value, c.under.map(key => back.find(x => x.key === key)!.value)])).toEqual([['kan', []], ['rin', ['tree']]])
  expect((await claims(a)).filter(([, value]) => value === 'tree')).toEqual([['meaning', 'tree', [first]]])
})

test('what a hidden record once said of evidence does not surface when the evidence moves', async () => {
  const { db, a, b, who, other, rows } = await fixture()
  const dup = await createEntry(db, fields([newClaim('ids', '⿰木木')]), seen('SECRET'), [], who)
  const held = (await getEntry(db, dup))!.sightings[0].id
  await addSighting(db, dup, seen('Dup two'), [], who)
  await editSighting(db, held, 1, seen('Plain'), null, who, null, dup)
  expect(await mergeEntry(db, dup, a, who, null)).toEqual({ ok: true })
  await setHidden(db, { entry: dup }, true, other, null)
  expect(await moveSighting(db, a, held, 2, b, who, null)).toBe('done')
  expect(JSON.stringify([await rows(b), (await globalHistory(db)).rows])).not.toContain('SECRET')
})

test('a comment or a report written while the evidence moved goes where it went', async () => {
  const { db, a, b, s, who, other } = await fixture()
  expect(await moveSighting(db, a, s, 1, b, who, null)).toBe('done')
  await addComment(db, { entry: a, sighting: s }, 'late', other)
  await report(db, { entry: a, sighting: s }, 'late', other.actor)
  expect((await commentsOf(db, b)).map(c => c.body)).toEqual(['late'])
  expect((await openReports(db, 0)).reports[0]).toMatchObject({ entry_id: b, sighting_id: s })
})

test('a move reads no whole table', () => {
  const { raw } = openTestDb()
  const plan = (sql: string) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map(row => row.detail).join()
  for (const sql of ['UPDATE revisions SET entry_id = 1 WHERE entry_id = 2 AND sighting_id = 3', 'UPDATE comments SET entry_id = 1, first_entry = 1 WHERE entry_id = 2 AND sighting_id = 3', 'UPDATE reports SET entry_id = 1 WHERE sighting_id = 3'])
    expect(plan(sql)).not.toMatch(/SCAN (revisions|comments|reports)/)
})

test('a redacted move still says which evidence went where, and the recorders are told', async () => {
  const { db, a, b, s, who, other, rows } = await fixture()
  expect(await moveSighting(db, a, s, 1, b, other, 'a private reason')).toBe('done')
  expect((await notificationsOf(db, who.actor)).notifications.map(n => [n.kind, n.entry_id, n.text])).toEqual([['edit', b, 'a private reason'], ['edit', a, 'a private reason']])
  const move = (await history(db, a))[0]
  expect(await redactRevision(db, a, move.id, other, null)).toBe(false)
  await editEntry(db, a, 2, { ...fields((await getEntry(db, a))!.claims), description: 'later' }, who, null)
  expect(await redactRevision(db, a, move.id, other, null)).toBe(true)
  expect((await rows(a)).find(row => row.id === move.id)).toMatchObject({ kind: 'move', moved: { sighting: s, to: b }, summary: null, fields: null, redacted: true })
})
