import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { SEARCH_WINDOW, SIGHTINGS_MAX } from '$lib/server/entries'
import { actions as createActions } from './[locale]/new/+page.server'
import { actions as detailActions, load as detailLoad } from './[locale]/entry/[id]/+page.server'
import { actions as addSightingActions } from './[locale]/entry/[id]/sighting/new/+page.server'
import { load as browseLoad } from './[locale]/+page.server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])

test('create, browse, view, edit and add a sighting', async () => {
  const { db } = openTestDb()
  const objects = new Map<string, Uint8Array>()
  const event = (form = new FormData(), id = '1') => ({
    request: { formData: async () => form }, url: new URL('https://example.test/en'),
    params: { locale: 'en', id }, locals: { person: null, theme: 'system' },
    platform: { env: { DB: db, MEDIA: { put: async (key: string, bytes: Uint8Array) => objects.set(key, bytes) } } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const form = new FormData()
  form.set('place', 'A book')
  form.set('image', new File([png], 'page.png', { type: 'image/png' }))
  await expect(createActions.default(event(form))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  const browse = await browseLoad(event()) as any
  expect(browse.tiles.map((tile: { id: number }) => tile.id)).toEqual([1])
  let detail = await detailLoad(event()) as any
  expect(detail.entry.rev).toBe(1)
  expect(detail.sightings).toHaveLength(1)
  expect(objects.size).toBe(1)
  const edit = new FormData(); edit.set('rev', '1'); edit.set('description', 'Updated')
  await expect(detailActions.edit(event(edit))).rejects.toMatchObject({ status: 303 })
  const stale = await detailActions.edit(event(edit)) as any
  expect(stale.status).toBe(409)
  const seen = new FormData(); seen.set('url', 'https://example.test/source')
  await expect(addSightingActions.default(event(seen))).rejects.toMatchObject({ status: 303 })
  detail = await detailLoad(event()) as any
  expect(detail.entry.description).toBe('Updated')
  expect(detail.sightings).toHaveLength(2)
})

function sightingFixture(count: number, put: (key: string, bytes: Uint8Array) => Promise<unknown>) {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026'); INSERT INTO entries(id, script, created_by, created_at, updated_at) VALUES (1, 'han', 'p', '2026', '2026')")
  const insert = raw.prepare("INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at, hidden_at) VALUES (1, 1, 'existing', 'p', '2026', '2026', ?)")
  for (let i = 0; i < count; i++) insert.run(i === 0 ? 'hidden' : null)
  const form = new FormData()
  form.set('place', 'Book')
  form.set('image', new File([png], 'page.png', { type: 'image/png' }))
  const event = () => ({ request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en', id: '1' }, locals: { person: { id: 'p' } }, platform: { env: { DB: db, MEDIA: { put } } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' }) as any
  return { raw, form, event }
}

test('full entry including hidden sightings rejects before R2 writes', async () => {
  let puts = 0
  const { event } = sightingFixture(SIGHTINGS_MAX, async () => { puts++ })
  expect(await addSightingActions.default(event())).toMatchObject({ status: 400, data: { error: 'sightingLimit', values: { place: 'Book' } } })
  expect(puts).toBe(0)
})

test('concurrent submissions passing precheck still enforce the final cap', async () => {
  let puts = 0
  let release!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  const { raw, event } = sightingFixture(SIGHTINGS_MAX - 1, async () => { if (++puts === 2) release(); await barrier })
  const results = await Promise.allSettled([addSightingActions.default(event()), addSightingActions.default(event())])
  expect(puts).toBe(2)
  expect(results.filter(result => result.status === 'rejected' && (result.reason as any).status === 303)).toHaveLength(1)
  expect(results.filter(result => result.status === 'fulfilled' && (result.value as any).data?.error === 'sightingLimit')).toHaveLength(1)
  expect(raw.query('SELECT count(*) AS n FROM sightings WHERE entry_id = 1').get()).toEqual({ n: SIGHTINGS_MAX })
})

test('a failed thumbnail put leaves no database sighting', async () => {
  const written: string[] = []
  let attempts = 0
  const { raw, form, event } = sightingFixture(1, async key => {
    if (++attempts === 2) throw new Error('thumbnail put failed')
    written.push(key)
  })
  const thumb = png.slice(); thumb[19] = 9
  form.set('thumb', new File([thumb], 'thumb.png', { type: 'image/png' }))
  await expect(addSightingActions.default(event())).rejects.toThrow('thumbnail put failed')
  expect(attempts).toBe(2)
  expect(written).toHaveLength(1)
  expect(raw.query('SELECT count(*) AS n FROM sightings WHERE entry_id = 1').get()).toEqual({ n: 1 })
})

test('browse continues an empty search window and reports the final segment', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x < ?)
    INSERT INTO entries(id, script, created_by, created_at, updated_at) SELECT x, 'han', 'p', '2026', '2026' FROM seq`).run(SEARCH_WINDOW + 1)
  raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 's:han', id FROM entries")
  const event = (url: string) => ({ url: new URL(url), platform: { env: { DB: db } } }) as any
  const first = await browseLoad(event('https://example.test/en?q=missing')) as any
  expect(first).toMatchObject({ tiles: [], next: 2, partial: true, continued: false })
  const last = await browseLoad(event(`https://example.test/en?q=missing&before=${first.next}`)) as any
  expect(last).toMatchObject({ tiles: [], next: null, partial: false, continued: true })
  await expect(browseLoad(event('https://example.test/en?q=missing&before=0'))).rejects.toMatchObject({ status: 404 })
})

test('browse recognizes complete IDS without applying the component term limit', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (1, 'han', '⿰木木', 'p', '2026', '2026'), (2, 'han', '⿱木木', 'p', '2026', '2026'), (3, 'han', '⿰木⿰水⿰火⿰土⿰金石', 'p', '2026', '2026')")
  raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 's:han', id FROM entries")
  const event = (q: string) => ({ url: new URL(`https://example.test/en?q=${encodeURIComponent(q)}`), platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('⿰木木'))).toMatchObject({ searchError: null, tiles: [{ id: 1 }] })
  expect(await browseLoad(event('⿰木⿰水⿰火⿰土⿰金石'))).toMatchObject({ searchError: null, tiles: [{ id: 3 }] })
})

test('browse explains invalid search terms without showing unfiltered entries', async () => {
  const { db } = openTestDb()
  const event = (q: string) => ({ url: new URL(`https://example.test/en?q=${encodeURIComponent(q)}`), platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('one two three four five six'))).toMatchObject({ searchError: 'tooManyTerms', tiles: [], next: null })
  expect(await browseLoad(event('... ⿰'))).toMatchObject({ searchError: 'noSearchTerms', tiles: [], next: null })
  const longQuery = 'a'.repeat(201)
  expect(await browseLoad(event(longQuery))).toMatchObject({ searchError: 'queryTooLong', query: longQuery, tiles: [], next: null })
  expect(await browseLoad(event('a'.repeat(200)))).toMatchObject({ searchError: null })
})

test('submission rejects missing place and missing evidence', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  const event = { request: { formData: async () => form }, url: new URL('https://example.test/en'), locals: {}, platform: { env: { DB: db, MEDIA: {} } }, getClientAddress: () => '127.0.0.1' } as any
  expect((await createActions.default(event) as any).data.error).toBe('place')
  form.set('place', 'A book')
  expect((await createActions.default(event) as any).data.error).toBe('evidence')
})

test('a source link can serve as evidence without an upload', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  form.set('url', 'https://example.test/source')
  const event = { request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' } as any
  await expect(createActions.default(event)).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
})
