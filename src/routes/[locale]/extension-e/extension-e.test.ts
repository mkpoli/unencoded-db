import { expect, test } from 'bun:test'
import { createEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

const entry = (collection: boolean): EntryFields => ({
  script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null,
  claims: collection ? [{ kind: 'collection', value: 'extension-e', data: null, sighting_id: null }] : [],
})
const seen: SightingFields = { place: 'a book', url: null, title: null, author: null, publisher: null, report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null }

test('lists only the records in the extension-e collection', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES('p1', 'anon-1', '2026-01-01')")
  const who = { actor: 'p1', ip: null }
  const inside = await createEntry(db, entry(true), seen, [], who)
  await createEntry(db, entry(false), seen, [], who)
  const event = (search = '') => ({ url: new URL(`https://example.test/en/extension-e${search}`), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db } } }) as any
  const data = await load(event()) as any
  expect(data.tiles.map((tile: { id: number }) => tile.id)).toEqual([inside])
  await expect(load(event('?before=x'))).rejects.toMatchObject({ status: 404 })
})
