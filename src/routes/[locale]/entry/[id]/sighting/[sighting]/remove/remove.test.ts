import { expect, test } from 'bun:test'
import { createPerson } from '$lib/server/people'
import { addSighting, createEntry, getEntry, globalHistory, list, mergeEntry, openReports, putBackSighting, redactRevision, removeSighting, report, setHidden, unmergeEntry, type SightingFields } from '$lib/server/entries'
import { notificationsOf, thankable, unreadCount } from '$lib/server/notifications'
import { openTestDb } from '$lib/server/testdb'
import { actions as history, load as loadHistory } from '../../../history/+page.server'
import { load as loadReport } from '../../../report/+page.server'
import { actions, load } from './+page.server'

const seen = (place: string, original_date: string | null = null) => ({ place, url: null, title: null, container: null, source_kind: null, author: null, publisher: null, report_date: null, vias: [], original_date, page: null, contexts: null, style: null, types: null, quotes: null, note: null }) as SightingFields

async function fixture() {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const moderator = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, { script: 'han', script_other: null, radical: null, strokes: null, claims: [], description: null }, seen('First', '1921'), [], who)
  const second = (await addSighting(db, id, seen('Second', '1500'), [], who))!
  const event = (form: Record<string, string> = {}, sighting: number | string = second, entry: number | string = id) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(form)) data.set(name, value)
    return {
      request: { formData: async () => data }, url: new URL(`https://example.test/en/entry/${entry}/sighting/${sighting}/remove`),
      params: { locale: 'en', id: String(entry), sighting: String(sighting) }, locals: { person: null }, platform: { env: { DB: db } },
      cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
    } as any
  }
  const visible = async () => (await getEntry(db, id))!.sightings.filter(s => !s.hidden_at).map(s => s.id)
  const rows = async () => ((await loadHistory(event())) as any).rows as { kind: string; sighting_id: number | null; summary: string | null; removed: boolean; sightingRev: number | null }[]
  const gone = async () => ((await loadHistory(event())) as any).removed as { id: number; name: string }[]
  return { db, raw, who, moderator, id, second, event, visible, rows, gone }
}

test('removing evidence takes it off the record, keeps it in the history with the reason, and can be undone', async () => {
  const { db, raw, id, second, event, visible, rows, gone } = await fixture()
  expect(await load(event())).toMatchObject({ id, only: false, sighting: { id: second, place: 'Second', rev: 1 } })
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 2, firstYear: '1500' })
  await expect(actions.default(event({ rev: '1', summary: '  another form ' }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${id}/history` })
  expect(await visible()).not.toContain(second)
  // The record is listed by what it still holds.
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 1, firstYear: '1921' })
  expect((await rows())[0]).toMatchObject({ kind: 'remove', sighting_id: second, summary: 'another form', removed: true, sightingRev: 1 })
  expect(await gone()).toEqual([{ id: second, name: 'Second' }])
  expect((await rows()).filter(row => row.sighting_id === second).map(row => row.kind)).toEqual(['remove', 'sighting'])
  expect((await globalHistory(db)).rows[0]).toMatchObject({ kind: 'hide', sighting_id: second })
  await expect(history.putBack(event({ sighting: String(second) }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${id}#sighting-${second}` })
  expect(await visible()).toContain(second)
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 2, firstYear: '1500' })
  expect((await rows()).slice(0, 2).map(({ kind, removed }) => ({ kind, removed }))).toEqual([{ kind: 'put_back', removed: false }, { kind: 'remove', removed: false }])
  expect(await gone()).toEqual([])
  expect(raw.query('SELECT hidden_at, removed_by FROM sightings WHERE id = ?').get(second)).toEqual({ hidden_at: null, removed_by: null })
  // Put back once already.
  await expect(history.putBack(event({ sighting: String(second) }))).rejects.toMatchObject({ status: 404 })
})

test('a record keeps its last evidence, and a removal of an edited or a missing one is refused', async () => {
  const { db, raw, id, second, event, visible, who } = await fixture()
  expect(await actions.default(event({ rev: '9' }))).toMatchObject({ status: 409, data: { error: 'conflict' } })
  expect(await actions.default(event())).toMatchObject({ status: 409, data: { error: 'conflict' } })
  for (const bad of [event({ rev: '1' }, 99), event({ rev: '1' }, 'x'), event({ rev: '1' }, second, 99)]) await expect(actions.default(bad)).rejects.toMatchObject({ status: 404 })
  const other = await createEntry(db, { script: 'han', script_other: null, radical: null, strokes: null, claims: [], description: null }, seen('Other'), [], who)
  await expect(actions.default(event({ rev: '1' }, second, other))).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event({ rev: '1' }))).rejects.toMatchObject({ status: 303 })
  // Gone already, and the one that is left stays.
  await expect(actions.default(event({ rev: '1' }))).rejects.toMatchObject({ status: 404 })
  const [left] = await visible()
  expect(await load(event({}, left))).toMatchObject({ only: true })
  expect(await actions.default(event({ rev: '1' }, left))).toMatchObject({ status: 409, data: { error: 'only' } })
  expect(await visible()).toEqual([left])
  // A merged record takes no removal.
  raw.exec(`UPDATE entries SET merged_into = ${other} WHERE id = ${id}`)
  await expect(load(event({}, left))).rejects.toMatchObject({ status: 404 })
  expect(await putBackSighting(db, id, second, who)).toBe('merged')
})

test('what a moderator hid is not put back by a reader, and its history stays closed', async () => {
  const { db, id, second, event, rows, visible, who, moderator } = await fixture()
  await setHidden(db, { entry: id, sighting: second }, true, moderator, null)
  expect(await putBackSighting(db, id, second, who)).toBe('missing')
  await expect(history.putBack(event({ sighting: String(second) }))).rejects.toMatchObject({ status: 404 })
  expect((await rows()).some(row => row.sighting_id === second)).toBe(false)
  expect((await globalHistory(db)).rows.some(row => row.sighting_id === second)).toBe(false)
  await setHidden(db, { entry: id, sighting: second }, false, moderator, null)
  expect((await rows())[0].kind).toBe('unhide')
  // A moderator's hide takes over a removal.
  expect(await removeSighting(db, id, second, 1, who, null)).toBe('done')
  expect((await rows())[0]).toMatchObject({ kind: 'remove', removed: true })
  expect(await setHidden(db, { entry: id, sighting: second }, true, moderator, null)).toBe(true)
  expect(await putBackSighting(db, id, second, who)).toBe('missing')
  expect((await rows()).some(row => row.sighting_id === second)).toBe(false)
  await setHidden(db, { entry: id, sighting: second }, false, moderator, null)
  expect(await visible()).toContain(second)
})

test('removed evidence stays within a moderator\'s reach: reported, hidden, its reason and its old versions redacted', async () => {
  const { db, raw, id, second, event, rows, who, moderator } = await fixture()
  await report(db, { entry: id, sighting: second }, 'private details', who.actor)
  expect(await removeSighting(db, id, second, 1, who, 'the address of someone')).toBe('done')
  // A report of removed evidence still offers to hide it, and a new one can be made.
  expect((await openReports(db, 0)).reports[0].target_hidden_at).toBeNull()
  const asked = event(); asked.url = new URL(`https://example.test/en/entry/${id}/report?sighting=${second}`)
  expect(await loadReport(asked)).toMatchObject({ target: { entry: id, sighting: second } })
  const removal = raw.query("SELECT id FROM revisions WHERE kind = 'hide'").get() as { id: number }
  expect(await redactRevision(db, id, removal.id, moderator, null)).toBe(true)
  expect((await rows()).find(row => row.kind === 'remove')).toMatchObject({ summary: null })
  expect(JSON.stringify((await globalHistory(db)).rows)).not.toContain('address')
  expect(await redactRevision(db, id, removal.id, moderator, null)).toBe(false)
  await setHidden(db, { entry: id, sighting: second }, true, moderator, null)
  expect((await openReports(db, 0)).reports[0].target_hidden_at).not.toBeNull()
  await expect(loadReport(asked)).rejects.toMatchObject({ status: 404 })
})

test('the person who added the evidence is told of its removal, and the notices they hold stay listed', async () => {
  const { db, raw, id, second, who } = await fixture()
  const other = { actor: (await createPerson(db)).id, ip: null }
  expect(await removeSighting(db, id, second, 1, other, 'another form')).toBe('done')
  const told = async () => (await notificationsOf(db, who.actor)).notifications.map(({ kind, sighting_id, text }) => ({ kind, sighting_id, text }))
  expect(await told()).toEqual([{ kind: 'remove', sighting_id: second, text: 'another form' }])
  expect(await unreadCount(db, who.actor)).toBe(1)
  expect(await putBackSighting(db, id, second, other)).toBe('done')
  expect((await told()).map(notice => notice.kind)).toEqual(['put_back', 'remove'])
  // A moderator's hide tells no one and closes the notices about it.
  await setHidden(db, { entry: id, sighting: second }, true, other, null)
  expect(await told()).toEqual([])
  const removal = raw.query("SELECT id FROM revisions WHERE kind = 'hide' ORDER BY id LIMIT 1").get() as { id: number }
  expect(await thankable(db, id, removal.id)).toBe(false)
})

test('what people are counted for agrees with what the history shows through a removal, a takeover and a put-back', async () => {
  const { db, raw, id, second, who, moderator } = await fixture()
  const other = { actor: (await createPerson(db)).id, ip: null }
  const counted = () => Object.fromEntries((raw.query('SELECT id, changes FROM people').all() as { id: string; changes: number }[]).map(row => [row.id, row.changes]))
  const shown = async () => { const n: Record<string, number> = { [who.actor]: 0, [other.actor]: 0, [moderator.actor]: 0 }; for (const row of (await globalHistory(db)).rows) n[row.by_id]++; return n }
  const agree = async () => expect(counted()).toMatchObject(await shown())
  await agree()
  await removeSighting(db, id, second, 1, other, null); await agree()
  expect(counted()).toMatchObject({ [who.actor]: 3, [other.actor]: 1 })
  await putBackSighting(db, id, second, other); await agree()
  await removeSighting(db, id, second, 1, other, null); await agree()
  await setHidden(db, { entry: id, sighting: second }, true, moderator, null); await agree()
  await setHidden(db, { entry: id, sighting: second }, false, moderator, null); await agree()
})

test('evidence removed before or after a merge can be put back from the record that holds it', async () => {
  const { db, id, second, event, who, gone } = await fixture()
  const other = await createEntry(db, { script: 'han', script_other: null, radical: null, strokes: null, claims: [], description: null }, seen('Other'), [], who)
  const lost = async (entry: number) => ((await loadHistory(event({}, second, entry))) as any).removed.map((s: { id: number }) => s.id)
  await removeSighting(db, id, second, 1, who, null)
  await mergeEntry(db, id, other, who, null)
  expect(await lost(other)).toEqual([second])
  // Removed as one of the other record's, and left alone on its own after the merge is undone.
  const first = (await getEntry(db, other))!.sightings.find(s => s.first_entry === id && !s.hidden_at)!
  await removeSighting(db, other, first.id, 1, who, null)
  await unmergeEntry(db, id, who)
  expect((await gone()).map(s => s.id).sort()).toEqual([first.id, second].sort())
  expect(await putBackSighting(db, id, first.id, who)).toBe('done')
  expect((await gone()).map(s => s.id)).toEqual([second])
})
