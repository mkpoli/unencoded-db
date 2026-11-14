import { expect, test } from 'bun:test'
import { MEDIA_MAX } from '$lib/limits'
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

const picture = (raw: { prepare(sql: string): { run(...values: unknown[]): unknown } }, position: number, key: string) =>
  raw.prepare("INSERT INTO sighting_media(sighting_id, position, image_key, image_type, image_w, image_h, thumb_key, box) VALUES (1, ?, ?, 'image/png', 100, 80, ?, '[[1,2,10,10]]')").run(position, key, `${key}-thumb`)
const media = (raw: { query(sql: string): { all(): unknown[] } }) => raw.query('SELECT position, image_key, thumb_key, box FROM sighting_media WHERE sighting_id = 1 ORDER BY position').all()
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 20, 0, 0, 0, 20, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0])
const upload = (data: FormData, bytes = png) => data.append('image', new File([bytes], 'new.png', { type: 'image/png' }))
const stored = (event: any) => { event.platform.env.MEDIA = { put: async () => {} }; return event }

test('loads and edits a sighting while retaining its pictures', async () => {
  const { raw, event } = await fixture()
  picture(raw, 0, 'original'); picture(raw, 1, 'second')
  const loaded = await load(event()) as any
  expect(loaded.sighting.place).toBe('Original')
  expect(loaded.sighting.media.map((item: { image_key: string }) => item.image_key)).toEqual(['original', 'second'])
  await expect(actions.default(event(form()))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query('SELECT place, rev FROM sightings WHERE id = 1').get()).toEqual({ place: 'Changed', rev: 2 })
  expect(media(raw)).toEqual([{ position: 0, image_key: 'original', thumb_key: 'original-thumb', box: '[[1,2,10,10]]' }, { position: 1, image_key: 'second', thumb_key: 'second-thumb', box: '[[1,2,10,10]]' }])
  expect(raw.query("SELECT summary FROM revisions WHERE kind = 'sighting_edit'").get()).toEqual({ summary: 'Correction' })
})

test('removes the named pictures only when explicitly requested', async () => {
  const { raw, event } = await fixture()
  for (const [position, key] of [[0, 'a'], [1, 'b'], [2, 'c']] as const) picture(raw, position, key)
  const remove = form(); remove.append('remove_media', '0'); remove.append('remove_media', '2')
  await expect(actions.default(event(remove))).rejects.toMatchObject({ status: 303 })
  expect(media(raw)).toEqual([{ position: 0, image_key: 'b', thumb_key: 'b-thumb', box: '[[1,2,10,10]]' }])
  expect(raw.query('SELECT place, rev FROM sightings WHERE id = 1').get()).toEqual({ place: 'Changed', rev: 2 })
  expect(JSON.parse((raw.query("SELECT snapshot FROM revisions WHERE kind = 'sighting_edit'").get() as { snapshot: string }).snapshot).media.map((item: { image_key: string }) => item.image_key)).toEqual(['b'])
  const rest = form('2'); rest.set('remove_media', '0')
  await expect(actions.default(event(rest))).rejects.toMatchObject({ status: 303 })
  expect(media(raw)).toEqual([])
  expect((await load(event()) as any).sighting.media).toEqual([])
})

test('an uploaded picture follows the ones that stay, and replaces one that is removed', async () => {
  const { raw, event } = await fixture()
  picture(raw, 0, 'original')
  const added = form(); upload(added)
  await expect(actions.default(stored(event(added)))).rejects.toMatchObject({ status: 303 })
  let rows = media(raw) as { position: number; image_key: string; thumb_key: string }[]
  expect(rows.map(row => row.image_key)[0]).toBe('original')
  expect(rows).toHaveLength(2)
  expect(rows[1].thumb_key).toBe(rows[1].image_key)
  const replacement = form('2'); replacement.set('remove_media', '0')
  const other = png.slice(); other[19] = 30; upload(replacement, other)
  await expect(actions.default(stored(event(replacement)))).rejects.toMatchObject({ status: 303 })
  rows = media(raw) as typeof rows
  expect(rows.map(row => row.position)).toEqual([0, 1])
  expect(rows.map(row => row.image_key)).not.toContain('original')
})

test('a sighting cannot hold more pictures than the limit', async () => {
  const { raw, event } = await fixture()
  for (let i = 0; i < MEDIA_MAX; i++) picture(raw, i, `p${i}`)
  const over = form(); upload(over)
  const result = await actions.default(stored(event(over))) as any
  expect(result).toMatchObject({ status: 400, data: { error: 'image' } })
  expect(media(raw)).toHaveLength(MEDIA_MAX)
  const swap = form(); swap.set('remove_media', '0'); upload(swap)
  await expect(actions.default(stored(event(swap)))).rejects.toMatchObject({ status: 303 })
  expect(media(raw)).toHaveLength(MEDIA_MAX)
})

test('validates revision, place and image while retaining entered values', async () => {
  const { raw, event } = await fixture()
  picture(raw, 0, 'original')
  for (const rev of ['', '2', '1x']) {
    const result = await actions.default(event(form(rev))) as any
    expect(result.status).toBe(409); expect(result.data.values.place).toBe('Changed')
  }
  const missingPlace = form('1', '  '); missingPlace.set('remove_media', '0')
  const missingResult = await actions.default(event(missingPlace)) as any
  expect(missingResult.status).toBe(400); expect(missingResult.data.removeMedia).toEqual(['0'])
  const invalid = form(); invalid.set('image', new File(['bad'], 'bad.png', { type: 'image/png' }))
  expect((await actions.default(event(invalid)) as any).data.error).toBe('image')
  expect(raw.query('SELECT place, rev FROM sightings WHERE id = 1').get()).toEqual({ place: 'Original', rev: 1 })
  expect(media(raw)).toHaveLength(1)
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

test('a sighting with a picture keeps no place, and one with nothing is refused', async () => {
  const { raw, event } = await fixture()
  picture(raw, 0, 'original')
  await expect(actions.default(event(form('1', '')))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT place FROM sightings WHERE id = 1').get()).toEqual({ place: '' })
  const bare = form('2', ''); bare.append('remove_media', '0')
  expect(await actions.default(event(bare))).toMatchObject({ status: 400, data: { error: 'evidence' } })
})
