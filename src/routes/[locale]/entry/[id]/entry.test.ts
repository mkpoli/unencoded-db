import { expect, test } from 'bun:test'
import { createEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { newClaim } from '$lib/claims'
import { actions, load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿺𡕤面')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, publication_kind: null, volume: null, number: null, vias: [], original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }

test('a description in ids_add is passed to the page when it is a whole one, and only one', async () => {
  const { db } = openTestDb()
  const id = await createEntry(db, fields, sighting, [], { actor: (await createPerson(db)).id, ip: null })
  const idsAdd = async (query: string) => ((await load({ params: { locale: 'en', id: String(id) }, url: new URL(`https://example.test/en/entry/${id}${query}`), locals: { person: null }, platform: { env: { DB: db } } } as any)) as any).idsAdd
  expect(await idsAdd('')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱ 𡗗夂面')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱𡗗夂面')}&ids_add=${encodeURIComponent('⿰木木')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd('?ids_add=face')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺𡕤')}`)).toBeNull()
  expect(await idsAdd('?ids_add=')).toBeNull()
})

test('a comment is saved under its writer and may name only the record\'s own evidence', async () => {
  const { db } = openTestDb()
  const author = await createPerson(db), reader = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: author.id, ip: null })
  const post = (values: Record<string, string>, person: unknown = reader) => {
    const body = new FormData()
    for (const [name, value] of Object.entries(values)) body.set(name, value)
    const request = new Request(`https://example.test/en/entry/${id}?/comment`, { method: 'POST', body })
    return actions.comment({ request, params: { locale: 'en', id: String(id) }, url: new URL(request.url), locals: { person }, platform: { env: { DB: db } }, getClientAddress: () => '127.0.0.1' } as any)
  }
  await expect(post({ body: 'Is this 觀?', about: '1' })).rejects.toMatchObject({ status: 303, location: `/en/entry/${id}#comment-1` })
  await expect(post({ body: 'x', about: '99' })).rejects.toMatchObject({ status: 404 })
  expect(await post({ body: '  ' })).toMatchObject({ status: 400, data: { error: 'comment' } })
  await expect(post({ body: 'x' }, { ...reader, banned: true })).rejects.toMatchObject({ status: 403 })
  const page = (await load({ params: { locale: 'en', id: String(id) }, url: new URL(`https://example.test/en/entry/${id}?about=1`), locals: { person: null }, platform: { env: { DB: db } } } as any)) as any
  expect(page.about).toBe(1)
  expect(page.comments).toMatchObject([{ body: 'Is this 觀?', sighting_id: 1, by_id: reader.id }])
  const hide = (person: unknown) => {
    const body = new FormData(); body.set('comment', '1')
    const request = new Request(`https://example.test/en/entry/${id}?/hideComment`, { method: 'POST', body })
    return actions.hideComment({ request, params: { locale: 'en', id: String(id) }, url: new URL(request.url), locals: { person }, platform: { env: { DB: db } }, getClientAddress: () => '127.0.0.1' } as any)
  }
  await expect(hide(reader)).rejects.toMatchObject({ status: 403 })
  await expect(hide({ ...reader, moderator: true })).rejects.toMatchObject({ status: 303 })
})
