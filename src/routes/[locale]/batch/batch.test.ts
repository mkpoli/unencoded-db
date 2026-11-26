import { expect, test } from 'bun:test'
import { CLAIM_LIMITS } from '$lib/claims'
import { BATCH_ROWS_MAX } from '$lib/limits'
import { openTestDb } from '$lib/server/testdb'
import { actions } from './+page.server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])
const picture = () => new File([png], 'page.png', { type: 'image/png' })

function fixture(limit?: (key: { key: string }) => Promise<{ success: boolean }>) {
  const { db, raw } = openTestDb()
  const objects = new Map<string, Uint8Array>()
  const event = (form: FormData) => ({
    request: { formData: async () => form }, url: new URL('https://example.test/en/batch'),
    params: { locale: 'en' }, locals: { person: null, theme: 'system' },
    platform: { env: { DB: db, MEDIA: { put: async (key: string, bytes: Uint8Array) => objects.set(key, bytes) }, ...(limit ? { ADDS: { limit } } : {}) } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const count = (table: string) => (raw.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  return { event, count, raw }
}

function form(rows: { ids?: string; note?: string; related?: string; relationship?: string; picture?: boolean }[], shared: Record<string, string> = { place: 'A shop sign' }) {
  const data = new FormData()
  for (const [name, value] of Object.entries(shared)) data.set(name, value)
  for (const row of rows) {
    data.append('ids', row.ids ?? '')
    data.append('row_note', row.note ?? '')
    data.append('row_related_character', row.related ?? '')
    data.append('row_related_relationship', row.relationship ?? 'uncertain')
    data.append('image', row.picture ? picture() : new File([], ''))
    data.append('thumb', new File([], ''))
    data.append('box', '')
  }
  return data
}

test('saves each row as its own record under one source', async () => {
  const { event, count, raw } = fixture()
  await expect(actions.default(event(form([{ ids: '⿰山東', picture: true }, { ids: '⿱木木', note: 'second', picture: true }, {}], { place: 'A book', title: 'Zidian' })))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(count('entries')).toBe(2)
  expect(count('sightings')).toBe(2)
  expect(count('sources')).toBe(1)
  expect(count('sighting_media')).toBe(2)
  expect(raw.query('SELECT count(*) AS n FROM revisions WHERE kind = ?').get('create')).toEqual({ n: 2 })
  expect(raw.query("SELECT ids FROM entries ORDER BY id").all()).toEqual([{ ids: '⿰山東' }, { ids: '⿱木木' }])
  expect(raw.query('SELECT note FROM sightings ORDER BY id').all()).toEqual([{ note: null }, { note: 'second' }])
})

test('a link in the source lets rows go without pictures', async () => {
  const { event, count } = fixture()
  await expect(actions.default(event(form([{ ids: '⿰山東' }, { ids: '⿱木木' }], { place: 'A post', url: 'https://example.test/post' })))).rejects.toMatchObject({ status: 303 })
  expect(count('entries')).toBe(2)
})

test('a rejected batch returns the typed rows and saves nothing', async () => {
  const { event, count } = fixture()
  const result = await actions.default(event(form([{ ids: '⿰山東', picture: true }, { ids: '⿱木木' }]))) as any
  expect(result.status).toBe(400)
  expect(result.data).toMatchObject({ error: 'evidence', row: 2, values: { place: 'A shop sign', rows: [{ ids: '⿰山東' }, { ids: '⿱木木' }] } })
  expect(count('entries')).toBe(0)
  const bare = await actions.default(event(form([{}, {}]))) as any
  expect(bare.data.error).toBe('batchRows')
})

test('a row with a picture needs no place', async () => {
  const { event, count } = fixture()
  await expect(actions.default(event(form([{ ids: '⿰山東', picture: true }], {})))).rejects.toMatchObject({ status: 303 })
  expect(count('sightings')).toBe(1)
})

test('caps the rows', async () => {
  const { event, count } = fixture()
  const result = await actions.default(event(form(Array.from({ length: BATCH_ROWS_MAX + 1 }, () => ({ ids: '⿰山東', picture: true }))))) as any
  expect(result.data.error).toBe('batchTooMany')
  expect(result.data.values.rows).toHaveLength(BATCH_ROWS_MAX)
  expect(count('entries')).toBe(0)
})

test('every row is charged to the add allowance before anything is saved', async () => {
  let calls = 0
  const { event, count } = fixture(async () => ({ success: ++calls <= 2 }))
  const rows = [{ ids: '⿰山東', picture: true }, { ids: '⿱木木', picture: true }, { ids: '⿰木木', picture: true }]
  const result = await actions.default(event(form(rows))) as any
  expect(result.status).toBe(429)
  expect(result.data.error).toBe('slow')
  expect(result.data.values.rows).toHaveLength(3)
  expect(count('entries')).toBe(0)
})

test('saves related characters with their relationships, derived status, and canonical record codes', async () => {
  const { event, count, raw } = fixture()
  await expect(actions.default(event(form([
    { ids: '⿰山東', related: '棟', relationship: 'variant', picture: true },
    { ids: '⿱木木', related: '林', relationship: 'homograph', picture: true },
    { related: 'r+0001', relationship: 'similar', picture: true },
  ])))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })

  expect(count('entries')).toBe(3)
  expect(raw.query('SELECT status FROM entries ORDER BY id').all()).toEqual([{ status: 'variant' }, { status: 'homograph' }, { status: null }])
  const relations = (raw.query("SELECT entry_id, value, data FROM claims WHERE kind = 'relation' ORDER BY entry_id, position").all() as { entry_id: number; value: string; data: string }[])
    .map(row => ({ entry_id: row.entry_id, value: row.value, data: JSON.parse(row.data) }))
  expect(relations).toEqual([
    { entry_id: 1, value: '棟', data: { relationship: 'variant' } },
    { entry_id: 2, value: '林', data: { relationship: 'homograph' } },
    { entry_id: 3, value: 'R+0001', data: { relationship: 'similar' } },
  ])
})

test('handles a mixed batch where only some rows have related characters', async () => {
  const { event, count, raw } = fixture()
  await expect(actions.default(event(form([
    { ids: '⿰山東', related: '東', relationship: 'unifiable', picture: true },
    { ids: '⿱木木', picture: true },
  ])))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })

  expect(count('entries')).toBe(2)
  expect(raw.query('SELECT status FROM entries ORDER BY id').all()).toEqual([{ status: 'unifiable' }, { status: null }])
  const relations = (raw.query("SELECT entry_id, value, data FROM claims WHERE kind = 'relation' ORDER BY entry_id, position").all() as { entry_id: number; value: string; data: string }[])
    .map(row => ({ entry_id: row.entry_id, value: row.value, data: JSON.parse(row.data) }))
  expect(relations).toEqual([
    { entry_id: 1, value: '東', data: { relationship: 'unifiable' } },
  ])
})

test('rejects invalid relationship or overlong related character with row number and preserves typed values', async () => {
  const { event, count } = fixture()
  const badKind = await actions.default(event(form([
    { ids: '⿰山東', note: 'first', related: '棟', relationship: 'variant', picture: true },
    { ids: '⿱木木', note: 'second', related: '林', relationship: 'bogus', picture: true },
  ]))) as any
  expect(badKind.status).toBe(400)
  expect(badKind.data).toMatchObject({
    error: 'relatedCharacters',
    row: 2,
    values: {
      rows: [
        { ids: '⿰山東', note: 'first', related: '棟', relationship: 'variant' },
        { ids: '⿱木木', note: 'second', related: '林', relationship: 'bogus' },
      ],
    },
  })
  expect(count('entries')).toBe(0)

  const overlong = '木'.repeat(CLAIM_LIMITS.relation.length + 1)
  const tooLong = await actions.default(event(form([
    { ids: '⿰山東', note: 'first', related: overlong, relationship: 'similar', picture: true },
  ]))) as any
  expect(tooLong.status).toBe(400)
  expect(tooLong.data).toMatchObject({
    error: 'relatedCharacters',
    row: 1,
    values: {
      rows: [{ ids: '⿰山東', note: 'first', related: overlong, relationship: 'similar' }],
    },
  })
  expect(count('entries')).toBe(0)
})

test('skips spare rows that only have a relationship with a blank related character', async () => {
  const { event, count } = fixture()
  await expect(actions.default(event(form([
    { ids: '⿰山東', picture: true },
    { relationship: 'variant' },
    { related: '   ', relationship: 'homograph' },
  ])))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(count('entries')).toBe(1)

  const onlySpare = await actions.default(event(form([{ relationship: 'variant' }, { related: '  ', relationship: 'similar' }]))) as any
  expect(onlySpare.status).toBe(400)
  expect(onlySpare.data.error).toBe('batchRows')
})

test('rejects misaligned related-character and relationship arrays without saving', async () => {
  const { event, count } = fixture()
  const data = new FormData()
  data.set('url', 'https://example.test/source')
  data.append('ids', '⿰山東')
  data.append('ids', '⿱木木')
  data.append('row_related_character', '棟')
  data.append('row_related_character', '林')
  data.append('row_related_relationship', 'homograph')
  const result = await actions.default(event(data)) as any
  expect(result.status).toBe(400)
  expect(result.data.error).toBe('relatedCharacters')
  expect(count('entries')).toBe(0)
})
