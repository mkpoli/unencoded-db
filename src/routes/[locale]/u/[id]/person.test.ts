import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { addSighting, createEntry, editEntry, personRevisionsStatement, setHidden, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰木木')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null }
const event = (db: D1Database, person: string, before?: string) => ({
  params: { locale: 'en', id: person },
  url: new URL(`http://localhost/en/u/${person}${before === undefined ? '' : `?before=${before}`}`),
  platform: { env: { DB: db } },
}) as any

test('personal contributions list visible revisions with their old versions', async () => {
  const { db } = openTestDb()
  const first = await createPerson(db), second = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: first.id, ip: null })
  await editEntry(db, id, 1, { ...fields, description: 'Later' }, { actor: second.id, ip: null }, 'Corrected')
  await addSighting(db, id, { ...sighting, place: 'Second source' }, [], { actor: first.id, ip: null })

  const result = await load(event(db, first.id)) as any
  expect(result.person).toMatchObject({ id: first.id, name: first.name })
  expect(result.rows.map((row: any) => row.kind)).toEqual(['sighting', 'sighting', 'create'])
  expect(result.rows[0]).toMatchObject({ by_id: first.id, by_name: first.name, sightingFields: { ...sighting, place: 'Second source' } })
  expect(result.rows[0]).not.toHaveProperty('snapshot')
  expect(result.rows[2].fields).toEqual(fields)
  expect(result.next).toBeNull()

  const edits = await load(event(db, second.id)) as any
  expect(edits.rows).toHaveLength(1)
  expect(edits.rows[0]).toMatchObject({ kind: 'edit', fields: { ...fields, description: 'Later' }, summary: 'Corrected' })
})

test('personal contributions hide records and sightings a moderator hid', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: person.id, ip: null })
  const seen = (await db.prepare('SELECT id FROM sightings WHERE entry_id = ?').bind(id).first<{ id: number }>())!.id
  await setHidden(db, { entry: id, sighting: seen }, true, { actor: person.id, ip: null }, null)
  const withoutSighting = await load(event(db, person.id)) as any
  expect(withoutSighting.rows.map((row: any) => row.kind)).toEqual(['create'])
  expect(withoutSighting.rows.some((row: any) => row.sighting_id === seen)).toBe(false)
  await setHidden(db, { entry: id, sighting: seen }, false, { actor: person.id, ip: null }, null)
  expect((await load(event(db, person.id)) as any).rows.map((row: any) => row.kind)).toEqual(['unhide', 'hide', 'sighting', 'create'])
  await setHidden(db, { entry: id }, true, { actor: person.id, ip: null }, null)
  expect((await load(event(db, person.id)) as any).rows).toHaveLength(0)
})

test('personal contributions reject missing people and follow a merged person', async () => {
  const { db } = openTestDb()
  const first = await createPerson(db), second = await createPerson(db)
  await expect(load(event(db, '000000000000'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(db, 'not-a-person'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(db, first.id, '0'))).rejects.toMatchObject({ status: 404 })
  await db.prepare('UPDATE people SET merged_into = ? WHERE id = ?').bind(second.id, first.id).run()
  await expect(load(event(db, first.id))).rejects.toMatchObject({ status: 302, location: `/en/u/${second.id}` })
})

test('personal contributions page through a bounded revision range', async () => {
  const { db, raw } = openTestDb()
  const person = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: person.id, ip: null })
  const insert = raw.prepare("INSERT INTO revisions(entry_id,kind,rev,snapshot,actor,at) VALUES (?, 'edit', 1, ?, ?, '2026')")
  for (let i = 0; i < 65; i++) insert.run(id, JSON.stringify(fields), person.id)
  const first = await load(event(db, person.id)) as any
  expect(first.rows).toHaveLength(60)
  expect(first.next).toBeNumber()
  const second = await load(event(db, person.id, String(first.next))) as any
  expect(second.rows).toHaveLength(7)
  expect(second.next).toBeNull()
})

test('personal contributions keep the revision range on the actor index', () => {
  const { db, raw } = openTestDb()
  const statement = personRevisionsStatement(db, '0123456789ab') as unknown as { sql: string; values: unknown[] }
  const plan = raw.query(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...(statement.values as never[])) as { detail: string }[]
  const details = plan.map(row => row.detail).join('\n')
  expect(details).toMatch(/SEARCH r USING INDEX revisions_by_actor/)
  expect(details).toMatch(/SEARCH e USING INTEGER PRIMARY KEY/)
  expect(details).toMatch(/SEARCH s USING INTEGER PRIMARY KEY/)
  expect(details).not.toMatch(/SCAN r(?:\s|$)/)
})

test('a merged person\'s contributions join the account they signed in to', async () => {
  const { db } = openTestDb()
  const anonymous = await createPerson(db), account = await createPerson(db, 'atlas-user')
  const id = await createEntry(db, fields, sighting, [], { actor: anonymous.id, ip: null })
  await db.prepare('UPDATE people SET merged_into = ? WHERE id = ?').bind(account.id, anonymous.id).run()
  const result = await load(event(db, account.id)) as any
  expect(result.rows).toHaveLength(2)
  expect(result.rows.every((row: any) => row.entry_id === id && row.by_id === account.id && row.by_name === account.name)).toBe(true)
})
