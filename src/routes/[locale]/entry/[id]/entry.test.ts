import { expect, test } from 'bun:test'
import { createEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { newClaim } from '$lib/claims'
import { load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿺𡕤面')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, vias: [], original_date: null, page: null, context: null, style: null, types: null, quotes: null, note: null }

test('a description in ids_add is passed to the page when it is a whole one, and only one', async () => {
  const { db } = openTestDb()
  const id = await createEntry(db, fields, sighting, [], { actor: (await createPerson(db)).id, ip: null })
  const idsAdd = async (query: string) => ((await load({ params: { locale: 'en', id: String(id) }, url: new URL(`https://example.test/en/entry/${id}${query}`), platform: { env: { DB: db } } } as any)) as any).idsAdd
  expect(await idsAdd('')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱ 𡗗夂面')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱𡗗夂面')}&ids_add=${encodeURIComponent('⿰木木')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd('?ids_add=face')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺𡕤')}`)).toBeNull()
  expect(await idsAdd('?ids_add=')).toBeNull()
})
