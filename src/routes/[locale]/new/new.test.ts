import { expect, test } from 'bun:test'
import { ADD_SIGHTINGS_MAX } from '$lib/limits'
import { SIGHTING_START } from '$lib/scripts'
import { openTestDb } from '$lib/server/testdb'
import { setHidden } from '$lib/server/entries'
import { actions, load } from './+page.server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])
const picture = (height = 10) => { const bytes = png.slice(); bytes[23] = height; return new File([bytes], 'page.png', { type: 'image/png' }) }

function fixture(limit?: (key: { key: string }) => Promise<{ success: boolean }>) {
  const { db, raw } = openTestDb()
  const objects = new Map<string, Uint8Array>()
  const event = (form = new FormData(), query = '') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/new${query}`),
    params: { locale: 'en' }, locals: { person: null },
    platform: { env: { DB: db, MEDIA: { put: async (key: string, bytes: Uint8Array) => objects.set(key, bytes) }, ...(limit ? { ADDS: { limit } } : {}) } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const count = (table: string) => (raw.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  return { db, raw, event, objects, count }
}

type Section = { pictures?: File[]; types?: string[] } & Partial<Record<'place' | 'url' | 'title' | 'author' | 'page' | 'original_date' | 'note' | 'via_url' | 'via_title', string>>

// The form as the page sends it: the record's fields, then each sighting behind its opening field, its
// pickers sending `image`, `thumb` and `box` together.
function page(sightings: Section[], record: Record<string, string | string[]> = {}) {
  const form = new FormData()
  const put = (name: string, value: string | string[]) => { for (const item of [value].flat()) form.append(name, item) }
  for (const [name, value] of Object.entries(record)) put(name, value)
  for (const { pictures = [], ...fields } of sightings) {
    form.append(SIGHTING_START, '')
    for (const file of pictures.length ? pictures : [new File([], '')]) { form.append('image', file); form.append('thumb', new File([], '')); form.append('box', '') }
    for (const [name, value] of Object.entries(fields)) put(name, value as string | string[])
  }
  return form
}

test('the form starts from a visible sighting', async () => {
  const { db, raw, event } = fixture()
  const form = page([{ place: 'A dictionary', url: 'https://example.test/book', title: 'Book', page: '12', original_date: '1617', note: 'only this character' }])
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303 })
  expect(await load(event(undefined, '?sighting=1'))).toEqual({ seed: { values: { url: 'https://example.test/book', title: 'Book', author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, place: 'A dictionary', original_date: '1617', page: '12' }, pictures: [] } })
  expect(await load(event())).toEqual({ seed: null })
  expect(await load(event(undefined, '?sighting=9'))).toEqual({ seed: null })
  const moderator = (raw.query('SELECT id FROM people LIMIT 1').get() as { id: string }).id
  await setHidden(db, { entry: 1 }, true, { actor: moderator, ip: null }, null)
  expect(await load(event(undefined, '?sighting=1'))).toEqual({ seed: null })
})

test('a via link satisfies the picture or link rule, must be a web link, and is seeded', async () => {
  const { event } = fixture()
  const sighting: Section = { place: 'A page', via_title: 'A post' }
  expect(await actions.default(event(page([sighting])))).toMatchObject({ status: 400, data: { error: 'evidence', sighting: 1 } })
  sighting.via_url = 'javascript:alert(1)'
  expect(await actions.default(event(page([sighting])))).toMatchObject({ status: 400, data: { error: 'evidence', sighting: 1 } })
  sighting.via_url = 'https://example.test/post/1'; sighting.title = 'Book'
  await expect(actions.default(event(page([sighting])))).rejects.toMatchObject({ status: 303 })
  expect((await load(event(undefined, '?sighting=1')) as any).seed.values).toMatchObject({ title: 'Book', via_url: 'https://example.test/post/1', via_title: 'A post' })
})

test('each description is a value of its own, in the order given', async () => {
  const { event, raw } = fixture()
  const form = page([{ place: 'A shop sign', url: 'https://example.test/sign' }], { ids: ['⿰山東', '⿱山東', ' ', '⿰山東', '⿰山⿻日木'] })
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query("SELECT value FROM claims WHERE kind = 'ids' ORDER BY position").all()).toEqual([{ value: '⿰山東' }, { value: '⿱山東' }, { value: '⿰山⿻日木' }])
  expect(raw.query('SELECT ids FROM entries').get()).toEqual({ ids: '⿰山東' })
})

test('too many descriptions come back as they were typed', async () => {
  const { event, count } = fixture()
  const ids = Array.from({ length: 21 }, (_, index) => `⿰山${String.fromCodePoint(0x4e00 + index)}`)
  const result = await actions.default(event(page([{ place: 'A sign', url: 'https://example.test/sign' }], { ids }))) as any
  expect(result).toMatchObject({ status: 400, data: { error: 'ids', sighting: 0 } })
  expect(result.data.values.claims.map((claim: { value: string }) => claim.value)).toEqual(ids)
  expect(count('entries')).toBe(0)
})

test('a record is saved with every sighting of the form', async () => {
  const { event, raw, count, objects } = fixture()
  const book = { title: 'Zidian', author: 'Mei Yingzuo' }
  const form = page([
    { place: 'Page 12', ...book, types: ['definition', 'reading'], pictures: [picture(10), picture(11)] },
    { place: 'Page 40', ...book, note: 'a second form', pictures: [picture(13)] },
    { place: 'A post', url: 'https://example.test/post' },
  ], { ids: '⿰山東', description: 'Seen three times' })
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(count('entries')).toBe(1)
  expect(raw.query('SELECT entry_id, first_entry, place, note, types FROM sightings ORDER BY id').all()).toEqual([
    { entry_id: 1, first_entry: 1, place: 'Page 12', note: null, types: '["definition","reading"]' },
    { entry_id: 1, first_entry: 1, place: 'Page 40', note: 'a second form', types: null },
    { entry_id: 1, first_entry: 1, place: 'A post', note: null, types: null },
  ])
  // The two pages cite one book; the post cites its link.
  expect(raw.query('SELECT title, url FROM sources ORDER BY id').all()).toEqual([{ title: 'Zidian', url: null }, { title: null, url: 'https://example.test/post' }])
  expect(raw.query('SELECT c.title, c.url FROM sightings s JOIN sources c ON c.id = s.source_id ORDER BY s.id').all()).toEqual([{ title: 'Zidian', url: null }, { title: 'Zidian', url: null }, { title: null, url: 'https://example.test/post' }])
  expect(raw.query('SELECT sighting_id, count(*) AS n FROM sighting_media GROUP BY sighting_id ORDER BY sighting_id').all()).toEqual([{ sighting_id: 1, n: 2 }, { sighting_id: 2, n: 1 }])
  expect(objects.size).toBe(3)
  expect(raw.query('SELECT kind, sighting_id FROM revisions ORDER BY id').all()).toEqual([{ kind: 'create', sighting_id: null }, { kind: 'sighting', sighting_id: 1 }, { kind: 'sighting', sighting_id: 2 }, { kind: 'sighting', sighting_id: 3 }])
  expect(raw.query('SELECT sightings, cover_place FROM entries').get()).toEqual({ sightings: 3, cover_place: 'Page 12' })
})

test('a later sighting without a picture or a link stops the whole form', async () => {
  const { event, count, objects } = fixture()
  const form = page([{ place: 'Page 12', title: 'Zidian', pictures: [picture()] }, { place: 'Page 40', title: 'Zidian', note: 'no picture' }], { ids: '⿰山東' })
  const result = await actions.default(event(form)) as any
  expect(result).toMatchObject({ status: 400, data: { error: 'evidence', sighting: 2 } })
  // What was typed comes back for every sighting.
  expect(result.data.values.sightings).toMatchObject([{ place: 'Page 12', title: 'Zidian' }, { place: 'Page 40', title: 'Zidian', note: 'no picture' }])
  expect(result.data.values.claims).toMatchObject([{ kind: 'ids', value: '⿰山東' }])
  for (const table of ['entries', 'sightings', 'sighting_media', 'sources', 'revisions', 'claims']) expect(count(table)).toBe(0)
  expect(objects.size).toBe(0)
})

test('a later sighting needs its place and readable pictures before anything is stored', async () => {
  const { event, count, objects } = fixture()
  const nowhere = page([{ place: 'Page 12', pictures: [picture()] }, { title: 'Zidian', pictures: [picture(11)] }])
  expect(await actions.default(event(nowhere))).toMatchObject({ status: 400, data: { error: 'place', sighting: 2 } })
  const unreadable = page([{ place: 'Page 12', pictures: [picture()] }, { place: 'Page 40', pictures: [new File(['not a picture'], 'page.png', { type: 'image/png' })] }])
  expect(await actions.default(event(unreadable))).toMatchObject({ status: 400, data: { error: 'image', sighting: 2 } })
  expect(count('entries')).toBe(0)
  expect(objects.size).toBe(0)
})

test('a sighting left empty is passed over, and a form needs one', async () => {
  const { event, count } = fixture()
  const bare = await actions.default(event(page([{}, {}], { ids: '⿰山東' }))) as any
  expect(bare).toMatchObject({ status: 400, data: { error: 'place', sighting: 1, values: { sightings: [] } } })
  expect(await actions.default(event(new FormData()))).toMatchObject({ status: 400, data: { error: 'place', sighting: 1 } })
  const flat = new FormData(); flat.set('place', 'A sign'); flat.set('url', 'https://example.test/flat')
  await expect(actions.default(event(flat))).rejects.toMatchObject({ status: 303 })
  await expect(actions.default(event(page([{}, { place: 'A sign', url: 'https://example.test/sign' }, {}])))).rejects.toMatchObject({ status: 303 })
  expect(count('sightings')).toBe(2)
})

test('fields outside a sighting are not read as one', async () => {
  const { event, raw } = fixture()
  const form = new FormData()
  form.set('place', 'Before any sighting'); form.set('url', 'https://example.test/stray')
  form.append(SIGHTING_START, ''); form.set('title', 'Book'); form.append('place', 'Page 3'); form.append('url', 'https://example.test/book')
  form.set('description', 'After the sightings')
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT place FROM sightings').all()).toEqual([{ place: 'Page 3' }])
  expect(raw.query('SELECT description FROM entries').get()).toEqual({ description: 'After the sightings' })
})

test('every sighting after the first takes one more add from the rate window', async () => {
  // The request itself takes the first.
  let left = 3
  const { event, count, objects } = fixture(async () => ({ success: left-- > 0 }))
  const sighting = (n: number): Section => ({ place: `Page ${n}`, url: `https://example.test/${n}`, pictures: [picture(10 + n)] })
  const result = await actions.default(event(page([sighting(1), sighting(2), sighting(3), sighting(4)]))) as any
  expect(result).toMatchObject({ status: 429, data: { error: 'slow', sighting: 0 } })
  expect(result.data.values.sightings).toHaveLength(4)
  expect(count('entries')).toBe(0)
  expect(objects.size).toBe(0)
  left = 3
  await expect(actions.default(event(page([sighting(1), sighting(2), sighting(3)])))).rejects.toMatchObject({ status: 303 })
  expect(count('sightings')).toBe(3)
})

test('a form holds a limited number of sightings', async () => {
  const { event, count } = fixture()
  const sightings = Array.from({ length: ADD_SIGHTINGS_MAX + 1 }, (_, n) => ({ place: `Page ${n}`, url: `https://example.test/${n}` }))
  expect(await actions.default(event(page(sightings)))).toMatchObject({ status: 400, data: { error: 'sightingsMax' } })
  expect(count('entries')).toBe(0)
  await expect(actions.default(event(page(sightings.slice(1))))).rejects.toMatchObject({ status: 303 })
  expect(count('sightings')).toBe(ADD_SIGHTINGS_MAX)
})
