import { expect, test } from 'bun:test'
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

function form(rows: { ids?: string; note?: string; picture?: boolean }[], shared: Record<string, string> = { place: 'A shop sign' }) {
  const data = new FormData()
  for (const [name, value] of Object.entries(shared)) data.set(name, value)
  for (const row of rows) {
    data.append('ids', row.ids ?? '')
    data.append('row_note', row.note ?? '')
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
  const nowhere = await actions.default(event(form([{ ids: '⿰山東', picture: true }], {}))) as any
  expect(nowhere.data.error).toBe('place')
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
