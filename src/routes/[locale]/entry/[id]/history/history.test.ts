import { ENTRY_HISTORY_PAGE } from '$lib/server/entries'
import { expect, test } from 'bun:test'
import { createEntry, editEntry, redactRevision, editSighting, getEntry, setHidden, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { actions, load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null, claims: [] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null }

test('malformed sighting types are ignored', async () => {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, fields, sighting, [], who)
  const loadEvent = { params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any
  expect((await load(loadEvent) as any).rows.find((row: any) => row.kind === 'sighting').sightingFields).toEqual(sighting)
  await db.prepare("UPDATE revisions SET snapshot = ? WHERE entry_id = ? AND kind = 'sighting'").bind(JSON.stringify({ ...sighting, types: JSON.stringify(['bogus']) }), id).run()
  expect((await load(loadEvent) as any).rows.find((row: any) => row.kind === 'sighting').sightingFields).toBeNull()
})

test('history shows journal metadata while protecting hidden records and sightings', async () => {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, fields, sighting, [], who)
  await editEntry(db, id, 1, { ...fields, description: 'new' }, who, 'Corrected description')
  const event = (value: string) => ({ params: { locale: 'ja', id: value }, platform: { env: { DB: db } } }) as any
  const result = await load(event(String(id))) as any
  expect(result.rows.map((row: any) => row.kind)).toEqual(['edit', 'sighting', 'create'])
  expect(result.rows[0]).toMatchObject({ summary: 'Corrected description', by_id: who.actor, at: expect.any(String) })
  expect(result.rows[0]).not.toHaveProperty('snapshot')
  expect(result.rows[0].fields).toEqual({ ...fields, description: 'new' })
  expect(result.rows[1].fields).toBeNull()
  expect(result.rows[1].sightingFields).toEqual(sighting)
  const seenId = (await getEntry(db, id))!.sightings[0].id
  await setHidden(db, { entry: id, sighting: seenId }, true, who, 'private')
  const filtered = await load(event(String(id))) as any
  expect(filtered.rows.every((row: any) => !row.sighting_id)).toBe(true)
  await setHidden(db, { entry: id }, true, who, null)
  await expect(load(event(String(id)))).rejects.toMatchObject({ status: 404 })
  await expect(load(event('bad'))).rejects.toMatchObject({ status: 404 })
  await expect(load(event('9999'))).rejects.toMatchObject({ status: 404 })
})

test('restores an entry snapshot, rejects stale revisions and protects other records', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const id = await createEntry(db, fields, sighting, [], who)
  const other = await createEntry(db, fields, sighting, [], who)
  await editEntry(db, id, 1, { ...fields, description: 'new' }, who, null)
  const event = (entry: number, rev: number, revision: number) => {
    const data = new FormData()
    data.set('rev', String(rev)); data.set('revision', String(revision))
    return { params: { locale: 'en', id: String(entry) }, platform: { env: { DB: db } }, locals: { person }, request: new Request('http://localhost', { method: 'POST', body: data }) } as any
  }
  const rows = (await load({ params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any) as any).rows
  const create = rows.find((row: any) => row.kind === 'create')
  const seen = rows.find((row: any) => row.kind === 'sighting')
  const otherRows = (await load({ params: { locale: 'en', id: String(other) }, platform: { env: { DB: db } } } as any) as any).rows
  const restore = actions.restore as (event: any) => Promise<any>
  await expect(restore(event(id, 2, seen.id))).rejects.toMatchObject({ status: 404 })
  await expect(restore(event(id, 2, otherRows.find((row: any) => row.kind === 'create').id))).rejects.toMatchObject({ status: 404 })
  expect(await restore(event(id, 1, create.id))).toMatchObject({ status: 409 })
  await expect(restore(event(id, 2, create.id))).rejects.toMatchObject({ status: 303 })
  expect((await getEntry(db, id))!.entry).toMatchObject({ rev: 3, description: null })
  const restored = (await load({ params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any) as any).rows[0]
  expect(restored).toMatchObject({ kind: 'revert', rev: 3, fields })
  await setHidden(db, { entry: id }, true, who, null)
  await expect(restore(event(id, 3, create.id))).rejects.toMatchObject({ status: 404 })
})

test('restores visible sighting text, preserving the current pictures and checking revision provenance', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db), who = { actor: person.id, ip: null }
  const oldImage = { image_key: 'old', image_type: 'image/png', image_w: 20, image_h: 20, thumb_key: 'old-thumb', box: null }
  const newImage = { ...oldImage, image_key: 'new', thumb_key: 'new-thumb' }
  const id = await createEntry(db, fields, sighting, [oldImage], who)
  const other = await createEntry(db, fields, sighting, [], who)
  const seen = (await getEntry(db, id))!.sightings[0]
  await editSighting(db, seen.id, 1, { ...sighting, place: 'Changed' }, [newImage], who, null, id)
  const loadEvent = (entry: number) => ({ params: { locale: 'en', id: String(entry) }, platform: { env: { DB: db } } }) as any
  const rows = (await load(loadEvent(id)) as any).rows
  const original = rows.find((r: any) => r.kind === 'sighting')
  expect(original.sightingFields).toEqual(sighting)
  expect(JSON.stringify(original)).not.toContain('old-thumb')
  expect(original.sightingRev).toBe(2)
  await db.prepare('UPDATE revisions SET snapshot = ? WHERE id = ?').bind(JSON.stringify({ ...sighting, secret: 'private', image_key: 'old' }), original.id).run()
  expect((await load(loadEvent(id)) as any).rows.find((r: any) => r.id === original.id).sightingFields).toEqual(sighting)
  const foreign = (await load(loadEvent(other)) as any).rows.find((r: any) => r.kind === 'sighting')
  const event = (rev: number, revision: number, sightingId = seen.id) => {
    const data = new FormData()
    data.set('rev', String(rev)); data.set('revision', String(revision)); data.set('sighting', String(sightingId))
    return { ...loadEvent(id), locals: { person }, request: new Request('http://localhost', { method: 'POST', body: data }) } as any
  }
  const restore = actions.restore as (event: any) => Promise<any>
  await expect(restore(event(2, foreign.id))).rejects.toMatchObject({ status: 404 })
  expect(await restore(event(1, original.id))).toMatchObject({ status: 409 })
  await expect(restore(event(2, original.id))).rejects.toMatchObject({ status: 303 })
  expect((await getEntry(db, id))!.sightings[0]).toMatchObject({ place: 'Source', rev: 3, media: [newImage] })
  const newest = (await load(loadEvent(id)) as any).rows[0]
  expect(newest).toMatchObject({ kind: 'sighting_edit', rev: 3, summary: 'r1', sightingFields: sighting })
  await setHidden(db, { entry: id, sighting: seen.id }, true, who, null)
  expect((await load(loadEvent(id)) as any).rows.every((r: any) => !r.sighting_id)).toBe(true)
  await expect(restore(event(3, original.id))).rejects.toMatchObject({ status: 404 })
})

test('history pages through a bounded journal even when a page contains hidden sightings', async () => {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, fields, sighting, [], who)
  const seen = (await getEntry(db, id))!.sightings[0]
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${ENTRY_HISTORY_PAGE + 1})
    INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, actor, at)
    SELECT ?, ?, 'sighting_edit', x + 1, '{}', ?, '2026-01-01' FROM n`).bind(id, seen.id, who.actor).run()
  await setHidden(db, { entry: id, sighting: seen.id }, true, who, null)
  const event = (url: string) => ({ params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } }, url: new URL(url) }) as any
  const first = await load(event('http://localhost/')) as any
  expect(first.rows).toHaveLength(0)
  expect(first.next).toBeNumber()
  const second = await load(event(`http://localhost/?before=${first.next}`)) as any
  expect(second.rows.map((row: any) => row.kind)).toEqual(['create'])
  expect(second.next).toBeNull()
  await expect(load(event('http://localhost/?before=bad'))).rejects.toMatchObject({ status: 404 })
})

test('snapshots expose only entry fields and ignore malformed snapshots', async () => {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, fields, sighting, [], who)
  await db.prepare("UPDATE revisions SET snapshot = ? WHERE entry_id = ? AND kind = 'create'").bind(JSON.stringify({ ...fields, secret: 'private sighting' }), id).run()
  const event = { params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any
  const rows = (await load(event) as any).rows
  expect(rows.find((row: any) => row.kind === 'create').fields).toEqual(fields)
  await db.prepare("UPDATE revisions SET snapshot = ? WHERE entry_id = ? AND kind = 'create'").bind('{broken', id).run()
  expect((await load(event) as any).rows.find((row: any) => row.kind === 'create').fields).toBeNull()
  await db.prepare("UPDATE revisions SET snapshot = ? WHERE entry_id = ? AND kind = 'sighting'").bind(JSON.stringify({ ...sighting, context: 'invalid' }), id).run()
  expect((await load(event) as any).rows.find((row: any) => row.kind === 'sighting').sightingFields).toBeNull()
})

test('restoring an entry snapshot brings its claims back', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db), who = { actor: person.id, ip: null }
  const before = { ...fields, claims: [{ kind: 'ids' as const, value: '⿰亻木', data: null, sighting_id: null }, { kind: 'reading' as const, value: 'tung', data: null, sighting_id: null }] }
  const id = await createEntry(db, before, sighting, [], who)
  await editEntry(db, id, 1, { ...fields, claims: [{ kind: 'meaning', value: 'east', data: null, sighting_id: null }] }, who, null)
  const rows = (await load({ params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any) as any).rows
  expect(rows.find((row: any) => row.kind === 'create').fields.claims).toEqual(before.claims)
  const data = new FormData(); data.set('rev', '2'); data.set('revision', String(rows.find((row: any) => row.kind === 'create').id))
  const restore = actions.restore as (event: any) => Promise<any>
  await expect(restore({ params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } }, locals: { person }, request: new Request('http://localhost', { method: 'POST', body: data }) })).rejects.toMatchObject({ status: 303 })
  const found = (await getEntry(db, id))!
  expect(found.claims).toEqual(before.claims)
  expect(found.entry.ids).toBe('⿰亻木')
})

test('a moderator redacts a past version, and it can no longer be restored or read', async () => {
  const { db, raw } = openTestDb()
  const person = await createPerson(db), who = { actor: person.id, ip: null }
  raw.prepare("UPDATE people SET role = 'moderator' WHERE id = ?").run(person.id)
  const id = await createEntry(db, { ...fields, description: 'private' }, sighting, [], who)
  await editEntry(db, id, 1, { ...fields, description: 'public' }, who, null)
  const loadEvent = { params: { locale: 'en', id: String(id) }, platform: { env: { DB: db } } } as any
  const create = (await load(loadEvent) as any).rows.find((row: any) => row.kind === 'create')
  const act = (action: 'redact' | 'restore', revision: number, rev = 2, moderator = true) => {
    const data = new FormData()
    data.set('revision', String(revision)); data.set('rev', String(rev)); data.set('summary', 'personal data')
    return (actions[action] as (event: any) => Promise<any>)({ ...loadEvent, locals: { person: { ...person, moderator, banned: false } }, request: new Request('http://localhost', { method: 'POST', body: data }), cookies: { set() {} }, getClientAddress: () => '127.0.0.1' })
  }
  await expect(act('redact', create.id, 2, false)).rejects.toMatchObject({ status: 403 })
  const current = (await load(loadEvent) as any).rows.find((row: any) => row.kind === 'edit')
  expect(await act('redact', current.id)).toMatchObject({ status: 409 })
  await expect(act('redact', create.id)).rejects.toMatchObject({ status: 303 })
  const rows = (await load(loadEvent) as any).rows
  expect(rows[0]).toMatchObject({ kind: 'redact', summary: 'personal data' })
  expect(rows.find((row: any) => row.id === create.id)).toMatchObject({ redacted: true, fields: null, summary: null })
  expect(JSON.stringify(rows)).not.toContain('private')
  await expect(act('restore', create.id)).rejects.toMatchObject({ status: 404 })
  expect(raw.query('SELECT snapshot, redacted_by FROM revisions WHERE id = ?').get(create.id)).toEqual({ snapshot: '{}', redacted_by: person.id })
  expect(await redactRevision(db, id, create.id, who, null)).toBe(false)
})
