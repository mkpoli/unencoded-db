import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../../../../../new/+page.server'
import { actions, load } from './+page.server'

async function fixture() {
  const { db, raw } = openTestDb()
  const event = (form = new FormData(), id = '1', sighting = '1') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/entry/${id}/sighting/${sighting}/edit`),
    params: { locale: 'en', id, sighting }, locals: { person: null }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const create = new FormData(); create.set('place', 'Original'); create.set('url', 'https://example.test/source')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  return { raw, event }
}
function form(rev = '1', place = 'Changed') {
  const data = new FormData(); data.set('rev', rev); data.set('place', place); data.set('summary', 'Correction')
  return data
}

test('loads and edits a sighting while retaining its image', async () => {
  const { raw, event } = await fixture()
  raw.exec("UPDATE sightings SET image_key = 'original', image_type = 'image/png', image_w = 100, image_h = 80, thumb_key = 'thumb', box = '[1,2,10,10]' WHERE id = 1")
  expect((await load(event()) as any).sighting.place).toBe('Original')
  await expect(actions.default(event(form()))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query('SELECT place, rev, image_key, thumb_key, box FROM sightings WHERE id = 1').get()).toEqual({ place: 'Changed', rev: 2, image_key: 'original', thumb_key: 'thumb', box: '[1,2,10,10]' })
  expect(raw.query("SELECT summary FROM revisions WHERE kind = 'sighting_edit'").get()).toEqual({ summary: 'Correction' })
})

test('removes the current image only when explicitly requested', async () => {
  const { raw, event } = await fixture()
  raw.exec("UPDATE sightings SET image_key = 'original', image_type = 'image/png', image_w = 100, image_h = 80, thumb_key = 'thumb', box = '[1,2,10,10]' WHERE id = 1")
  const remove = form(); remove.set('remove_image', '1')
  await expect(actions.default(event(remove))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT place, rev, image_key, image_type, image_w, image_h, thumb_key, box FROM sightings WHERE id = 1').get()).toEqual({ place: 'Changed', rev: 2, image_key: null, image_type: null, image_w: null, image_h: null, thumb_key: null, box: null })
})

test('an uploaded replacement takes precedence over removal', async () => {
  const { raw, event } = await fixture()
  raw.exec("UPDATE sightings SET image_key = 'original', thumb_key = 'thumb' WHERE id = 1")
  const replacement = form(); replacement.set('remove_image', '1')
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 20, 0, 0, 0, 20, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0])
  replacement.set('image', new File([png], 'new.png', { type: 'image/png' }))
  const request = event(replacement); request.platform.env.MEDIA = { put: async () => {} }
  await expect(actions.default(request)).rejects.toMatchObject({ status: 303 })
  const row = raw.query('SELECT image_key, thumb_key FROM sightings WHERE id = 1').get() as { image_key: string; thumb_key: string }
  expect(row.image_key).not.toBe('original')
  expect(row.image_key).toBeTruthy()
  expect(row.thumb_key).toBe(row.image_key)
})

test('validates revision, place and image while retaining entered values', async () => {
  const { raw, event } = await fixture()
  for (const rev of ['', '2', '1x']) {
    const result = await actions.default(event(form(rev))) as any
    expect(result.status).toBe(409); expect(result.data.values.place).toBe('Changed')
  }
  const missingPlace = form('1', '  '); missingPlace.set('remove_image', '1')
  const missingResult = await actions.default(event(missingPlace)) as any
  expect(missingResult.status).toBe(400); expect(missingResult.data.removeImage).toBe(true)
  const invalid = form(); invalid.set('image', new File(['bad'], 'bad.png', { type: 'image/png' }))
  expect((await actions.default(event(invalid)) as any).data.error).toBe('image')
  expect(raw.query('SELECT place, rev FROM sightings WHERE id = 1').get()).toEqual({ place: 'Original', rev: 1 })
})

test('rejects invalid, hidden, merged and mismatched targets on load and write', async () => {
  const { raw, event } = await fixture()
  const create = new FormData(); create.set('place', 'Other'); create.set('url', 'https://example.test/other')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  for (const [id, sighting] of [['0', '1'], ['1', '0'], ['1', '2'], ['2', '1'], ['1x', '1']]) {
    await expect(load(event(form(), id, sighting))).rejects.toMatchObject({ status: 404 })
    await expect(actions.default(event(form(), id, sighting))).rejects.toMatchObject({ status: 404 })
  }
  for (const sql of ["UPDATE sightings SET hidden_at = 'now'", "UPDATE sightings SET hidden_at = NULL; UPDATE entries SET hidden_at = 'now'", "UPDATE entries SET hidden_at = NULL, merged_into = 2"]) {
    raw.exec(sql)
    await expect(load(event())).rejects.toMatchObject({ status: 404 })
    await expect(actions.default(event(form()))).rejects.toMatchObject({ status: 404 })
  }
})

test('write guard rejects paused and rate-limited edits', async () => {
  const { raw, event } = await fixture()
  const paused = event(form()); paused.platform.env.WRITES_PAUSED = '1'
  await expect(actions.default(paused)).rejects.toMatchObject({ status: 503 })
  const limited = event(form()); limited.platform.env.EDITS = { limit: async () => ({ success: false }) }
  await expect(actions.default(limited)).rejects.toMatchObject({ status: 429 })
  expect(raw.query('SELECT rev FROM sightings WHERE id = 1').get()).toEqual({ rev: 1 })
})
