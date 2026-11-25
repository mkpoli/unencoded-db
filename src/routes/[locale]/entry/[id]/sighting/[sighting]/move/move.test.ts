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

test('evidence goes to the record a named duplicate was merged into, and undoing a merge leaves it where it was moved', async () => {
  const { db, a, b, s, who, event, ids, claims, agree } = await fixture()
  const reading = { ...newClaim('reading', 'rin'), sightings: [] as number[] }
  const dup = await createEntry(db, fields([newClaim('ids', '⿱木木'), reading]), seen('Dup'), [], who)
  const held = (await getEntry(db, dup))!.sightings[0].id
  await editEntry(db, dup, 1, fields([newClaim('ids', '⿱木木'), { ...reading, sightings: [held] }]), who, null)
  expect(await mergeEntry(db, dup, b, who, null)).toEqual({ ok: true })
  await expect(actions.default(event({ rev: '1', to: String(dup) }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${b}#sighting-${s}` })
  // What the duplicate brought moves on to the first record, and stays there when the merge is undone.
  expect(await moveSighting(db, b, held, 1, a, who, null)).toBe('done')
  expect((await claims(a)).slice(1)).toEqual([['reading', 'rin', [held]]])
  await agree()
  expect(await unmergeEntry(db, dup, who)).toBe(true)
  expect(await ids(a)).toContain(held)
  expect(await ids(dup)).toEqual([])
  expect((await claims(dup)).every(([, , rests]) => !(rests as number[]).includes(held))).toBe(true)
  expect(await ids(b)).toContain(s)
  await agree()
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
