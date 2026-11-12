import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../../../../new/+page.server'
import { actions, load } from './+page.server'

async function fixture() {
  const { db, raw } = openTestDb()
  const event = (form = new FormData(), id = '1') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/entry/${id}/sighting/new`),
    params: { locale: 'en', id }, locals: { person: null }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const create = new FormData(); create.set('place', 'Original'); create.set('url', 'https://example.test/source')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  return { raw, event }
}

test('loads the record and adds a sighting', async () => {
  const { raw, event } = await fixture()
  expect((await load(event()) as any).id).toBe(1)
  const form = new FormData(); form.set('place', 'Another source'); form.set('url', 'https://example.test/another'); form.set('types', 'attestation')
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query('SELECT place, types FROM sightings ORDER BY id DESC').get()).toEqual({ place: 'Another source', types: '["attestation"]' })
  expect(raw.query('SELECT s.url FROM sightings g JOIN sources s ON s.id = g.source_id ORDER BY g.id DESC').get()).toEqual({ url: 'https://example.test/another' })
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
  for (const sql of ["UPDATE entries SET hidden_at = 'now'", "UPDATE entries SET hidden_at = NULL, merged_into = 2"]) {
    raw.exec(sql)
    await expect(load(event())).rejects.toMatchObject({ status: 404 })
    await expect(actions.default(event(new FormData()))).rejects.toMatchObject({ status: 404 })
  }
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
