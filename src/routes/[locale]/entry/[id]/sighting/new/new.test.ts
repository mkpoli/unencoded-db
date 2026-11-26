import { expect, test } from 'bun:test'
import { setHidden } from '$lib/server/entries'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../../../../new/+page.server'
import { actions, load } from './+page.server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])

async function fixture() {
  const { db, raw } = openTestDb()
  const objects = new Map<string, Uint8Array>()
  const event = (form = new FormData(), id = '1', query = '') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/entry/${id}/sighting/new${query}`),
    params: { locale: 'en', id }, locals: { person: null },
    platform: { env: { DB: db, MEDIA: { put: async (key: string, bytes: Uint8Array) => objects.set(key, bytes) } } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const create = new FormData(); create.set('place', 'Original'); create.set('url', 'https://example.test/source')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  return { db, raw, event }
}

test('loads the record and adds a sighting', async () => {
  const { raw, event } = await fixture()
  expect(await load(event())).toEqual({ id: 1, ids: null, seed: null })
  const form = new FormData(); form.set('place', 'Another source'); form.set('url', 'https://example.test/another'); form.set('types', 'attestation')
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query('SELECT place, types FROM sightings ORDER BY id DESC').get()).toEqual({ place: 'Another source', types: '["attestation"]' })
  expect(raw.query('SELECT s.url FROM sightings g JOIN sources s ON s.id = g.source_id ORDER BY g.id DESC').get()).toEqual({ url: 'https://example.test/another' })
})

test('starts from a visible sighting of another record', async () => {
  const { db, raw, event } = await fixture()
  const second = new FormData()
  second.set('place', 'Page 12')
  second.set('url', 'https://example.test/book')
  second.set('title', 'Book')
  second.set('page', '12')
  second.set('original_date', '1617')
  second.set('note', 'only the other character')
  second.set('via_url', 'https://example.test/post')
  second.set('via_title', 'Post')
  second.set('image', new File([png], 'page.png', { type: 'image/png' }))
  await expect(createActions.default(event(second))).rejects.toMatchObject({ status: 303 })

  const seeded = await load(event(undefined, '1', '?sighting=2')) as any
  expect(seeded.id).toBe(1)
  expect(seeded.seed.id).toBe(2)
  expect(seeded.seed.entry).toBe(2)
  expect(seeded.seed.values).toEqual({
    url: 'https://example.test/book', title: 'Book', author: null, publisher: null, report_date: null,
    container: null, source_kind: null, place: 'Page 12', original_date: '1617', page: '12',
    vias: [{ url: 'https://example.test/post', title: 'Post', author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null }],
  })
  expect(seeded.seed.pictures).toHaveLength(1)
  expect((await load(event(undefined, '2', '?sighting=2')) as any).seed).toBeNull()
  expect((await load(event(undefined, '1', '?sighting=99')) as any).seed).toBeNull()
  expect((await load(event(undefined, '1', '?sighting=bad')) as any).seed).toBeNull()

  const moderator = (raw.query('SELECT id FROM people LIMIT 1').get() as { id: string }).id
  await setHidden(db, { entry: 2, sighting: 2 }, true, { actor: moderator, ip: null }, null)
  expect((await load(event(undefined, '1', '?sighting=2')) as any).seed).toBeNull()
  await setHidden(db, { entry: 2, sighting: 2 }, false, { actor: moderator, ip: null }, null)
  await setHidden(db, { entry: 2 }, true, { actor: moderator, ip: null }, null)
  expect((await load(event(undefined, '1', '?sighting=2')) as any).seed).toBeNull()
  await setHidden(db, { entry: 2 }, false, { actor: moderator, ip: null }, null)
  raw.exec('UPDATE entries SET merged_into = 1 WHERE id = 2')
  expect((await load(event(undefined, '1', '?sighting=2')) as any).seed).toBeNull()
})

test('a sighting needs a picture or a link', async () => {
  const { raw, event } = await fixture()
  const form = new FormData(); form.set('place', 'Another source'); form.set('title', 'Kept title')
  const result = await actions.default(event(form)) as any
  expect(result).toMatchObject({ status: 400, data: { error: 'evidence', values: { place: 'Another source', title: 'Kept title' } } })
  expect(raw.query('SELECT count(*) AS n FROM sightings').get()).toEqual({ n: 1 })
})

test('validates place and image while retaining entered values', async () => {
  const { raw, event } = await fixture()
  const missing = new FormData(); missing.set('place', '  '); missing.set('title', 'Kept title')
  const missingResult = await actions.default(event(missing)) as any
  expect(missingResult.status).toBe(400)
  expect(missingResult.data.values.place).toBe('')
  expect(missingResult.data.values.title).toBe('Kept title')
  const invalid = new FormData(); invalid.set('place', 'A source'); invalid.set('image', new File(['bad'], 'bad.png', { type: 'image/png' }))
  expect((await actions.default(event(invalid)) as any).data.error).toBe('image')
  expect(raw.query('SELECT count(*) AS n FROM sightings').get()).toEqual({ n: 1 })
})

test('rejects missing, hidden and merged records', async () => {
  const { raw, event } = await fixture()
  for (const id of ['0', '2', '1x']) {
    await expect(load(event(new FormData(), id))).rejects.toMatchObject({ status: 404 })
    await expect(actions.default(event(new FormData(), id))).rejects.toMatchObject({ status: 404 })
  }
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  await expect(load(event())).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event(new FormData()))).rejects.toMatchObject({ status: 404 })
  const create = new FormData(); create.set('place', 'Other'); create.set('url', 'https://example.test/other')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  raw.exec('UPDATE entries SET hidden_at = NULL WHERE id = 1; UPDATE entries SET merged_into = 1 WHERE id = 2')
  await expect(load(event(new FormData(), '2'))).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event(new FormData(), '2'))).rejects.toMatchObject({ status: 404 })
})

test('write guard rejects paused and rate-limited additions', async () => {
  const { raw, event } = await fixture()
  const form = () => { const data = new FormData(); data.set('place', 'A source'); return data }
  const paused = event(form()); paused.platform.env.WRITES_PAUSED = '1'
  await expect(actions.default(paused)).rejects.toMatchObject({ status: 503 })
  const limited = event(form()); limited.platform.env.ADDS = { limit: async () => ({ success: false }) }
  await expect(actions.default(limited)).rejects.toMatchObject({ status: 429 })
  expect(raw.query('SELECT count(*) AS n FROM sightings').get()).toEqual({ n: 1 })
})
