import { expect, test } from 'bun:test'
import { createPerson } from '$lib/server/people'
import { addSighting, createEntry, getEntry, globalHistory, list, removeSighting, putBackSighting, setHidden, type SightingFields } from '$lib/server/entries'
import { openTestDb } from '$lib/server/testdb'
import { actions as history, load as loadHistory } from '../../../history/+page.server'
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
  const rows = async () => ((await loadHistory(event())) as any).rows as { kind: string; sighting_id: number | null; summary: string | null; putBack: boolean }[]
  return { db, raw, who, moderator, id, second, event, visible, rows }
}

test('removing evidence takes it off the record, keeps it in the history with the reason, and can be undone', async () => {
  const { db, raw, id, second, event, visible, rows } = await fixture()
  expect(await load(event())).toMatchObject({ id, only: false, sighting: { id: second, place: 'Second', rev: 1 } })
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 2, firstYear: '1500' })
  await expect(actions.default(event({ rev: '1', summary: '  another form ' }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${id}/history` })
  expect(await visible()).not.toContain(second)
  // The record is listed by what it still holds.
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 1, firstYear: '1921' })
  expect((await rows())[0]).toMatchObject({ kind: 'remove', sighting_id: second, summary: 'another form', putBack: true })
  expect((await rows()).filter(row => row.sighting_id === second).map(row => row.kind)).toEqual(['remove', 'sighting'])
  expect((await globalHistory(db)).rows[0]).toMatchObject({ kind: 'hide', sighting_id: second })
  await expect(history.putBack(event({ sighting: String(second) }))).rejects.toMatchObject({ status: 303, location: `/en/entry/${id}#sighting-${second}` })
  expect(await visible()).toContain(second)
  expect((await list(db, {}))!.tiles[0]).toMatchObject({ sightings: 2, firstYear: '1500' })
  expect((await rows()).slice(0, 2).map(({ kind, putBack }) => ({ kind, putBack }))).toEqual([{ kind: 'put_back', putBack: false }, { kind: 'remove', putBack: false }])
  expect(raw.query('SELECT hidden_at, removed_by FROM sightings WHERE id = ?').get(second)).toEqual({ hidden_at: null, removed_by: null })
  // Put back once already.
  await expect(history.putBack(event({ sighting: String(second) }))).rejects.toMatchObject({ status: 404 })
  // Removed twice, only the newest removal carries the way back.
  await expect(actions.default(event({ rev: '1' }))).rejects.toMatchObject({ status: 303 })
  expect((await rows()).filter(row => row.kind === 'remove').map(row => row.putBack)).toEqual([true, false])
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
  expect((await rows())[0]).toMatchObject({ kind: 'remove', putBack: true })
  expect(await setHidden(db, { entry: id, sighting: second }, true, moderator, null)).toBe(true)
  expect(await putBackSighting(db, id, second, who)).toBe('missing')
  expect((await rows()).some(row => row.sighting_id === second)).toBe(false)
  await setHidden(db, { entry: id, sighting: second }, false, moderator, null)
  expect(await visible()).toContain(second)
})
