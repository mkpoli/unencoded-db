import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { SEARCH_WINDOW, SIGHTINGS_MAX } from '$lib/server/entries'
import { actions as createActions } from './[locale]/new/+page.server'
import { actions as detailActions, load as detailLoad } from './[locale]/entry/[id]/+page.server'
import { actions as addSightingActions } from './[locale]/entry/[id]/sighting/new/+page.server'
import { load as browseLoad } from './[locale]/+page.server'
import { load as sourcesLoad } from './[locale]/sources/+page.server'
import { load as categoriesLoad } from './[locale]/categories/+page.server'
import { load as tagsLoad } from './[locale]/tags/+page.server'
import * as tagsApi from './api/tags/+server'
import { tagList } from '$lib/server/tags'
import { load as radicalsLoad } from './[locale]/radicals/+page.server'
import { load as chronologyLoad } from './[locale]/chronology/+page.server'

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
  expect(detail.earliest).toBeNull()
  expect(objects.size).toBe(1)
  const edit = new FormData(); edit.set('rev', '1'); edit.set('description', 'Updated')
  await expect(detailActions.edit(event(edit))).rejects.toMatchObject({ status: 303 })
  const stale = await detailActions.edit(event(edit)) as any
  expect(stale.status).toBe(409)
  const seen = new FormData(); seen.set('url', 'https://example.test/source'); seen.set('original_date', '1935')
  await expect(addSightingActions.default(event(seen))).rejects.toMatchObject({ status: 303 })
  detail = await detailLoad(event()) as any
  expect(detail.earliest).toEqual({ year: '1935', kind: 'original', sighting: detail.sightings[1].id })
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
  raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT tag, id FROM entries CROSS JOIN (SELECT 'all' AS tag UNION ALL SELECT 's:han')")
  const event = (url: string) => ({ url: new URL(url), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  const first = await browseLoad(event('https://example.test/en?q=missing')) as any
  expect(first).toMatchObject({ tiles: [], next: '0.2', partial: true, continued: false, total: { n: 0, floor: false } })
  const last = await browseLoad(event(`https://example.test/en?q=missing&after=${first.next}`)) as any
  expect(last).toMatchObject({ tiles: [], next: null, partial: false, continued: true, total: null })
  await expect(browseLoad(event('https://example.test/en?q=missing&after=0.0'))).rejects.toMatchObject({ status: 404 })
})

test('browse lists every script, and a script narrows the list to its records', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (1, 'han', '⿰木木', 'p', '2026', '2026'), (2, 'bouyei', '⿱好看', 'p', '2026', '2026')")
  raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT 'all', id FROM entries UNION ALL SELECT 's:' || script, id FROM entries")
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  const ids = (result: any) => result.tiles.map((tile: { id: number }) => tile.id).sort()
  expect(ids(await browseLoad(event('')))).toEqual([1, 2])
  expect(await browseLoad(event(''))).toMatchObject({ script: null })
  expect(ids(await browseLoad(event('script=bouyei')))).toEqual([2])
  expect(ids(await browseLoad(event('script=han')))).toEqual([1])
  await expect(browseLoad(event('script=klingon'))).rejects.toMatchObject({ status: 404 })
})

test('browse answers an order or a cursor it does not know with 404', async () => {
  const { db } = openTestDb()
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  for (const query of ['sort=shuffle', 'sort=random&seed=4294967296', 'sort=random&seed=01', 'sort=random&after=5', 'sort=random&seed=5&after=x', 'sort=most&after=5', 'sort=new&after=1.5', 'sort=old&after=-1']) await expect(browseLoad(event(query))).rejects.toMatchObject({ status: 404 })
  expect(await browseLoad(event('sort=fewest&after=0.4'))).toMatchObject({ order: 'fewest', tiles: [] })
})

test('the source gallery answers an order or a cursor it does not know with 404', async () => {
  const { db } = openTestDb()
  const event = (query: string) => ({ url: new URL(`https://example.test/en/sources?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  for (const query of ['sort=added', 'sort=records', 'sort=old', 'sort=new&after=1.5', 'sort=most&after=5', 'sort=latest&after=x', 'sort=earliest&after=0']) await expect(sourcesLoad(event(query))).rejects.toMatchObject({ status: 404 })
  for (const query of ['', 'sort=most&after=2.5', 'sort=earliest&after=1850.4', 'sort=latest&after=4']) expect(await sourcesLoad(event(query))).toMatchObject({ sources: [], next: null })
})

test('browse recognizes complete IDS without applying the component term limit', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026')")
  raw.exec("INSERT INTO entries(id, script, ids, created_by, created_at, updated_at) VALUES (1, 'han', '⿰木木', 'p', '2026', '2026'), (2, 'han', '⿱木木', 'p', '2026', '2026'), (3, 'han', '⿰木⿰水⿰火⿰土⿰金石', 'p', '2026', '2026')")
  raw.exec("INSERT INTO claims(entry_id, position, key, kind, value) SELECT id, 0, printf('ids%05d', id), 'ids', ids FROM entries")
  raw.exec("INSERT INTO entry_tags(tag, entry_id) SELECT tag, id FROM entries CROSS JOIN (SELECT 'all' AS tag UNION ALL SELECT 's:han')")
  const event = (q: string) => ({ url: new URL(`https://example.test/en?q=${encodeURIComponent(q)}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('⿰木木'))).toMatchObject({ searchError: null, tiles: [{ id: 1 }] })
  expect(await browseLoad(event('⿰木⿰水⿰火⿰土⿰金石'))).toMatchObject({ searchError: null, tiles: [{ id: 3 }] })
})

test('browse explains invalid search terms without showing unfiltered entries', async () => {
  const { db } = openTestDb()
  const event = (q: string) => ({ url: new URL(`https://example.test/en?q=${encodeURIComponent(q)}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('one two three four five six'))).toMatchObject({ searchError: 'tooManyTerms', tiles: [], next: null })
  expect(await browseLoad(event('... ⿰'))).toMatchObject({ searchError: 'noSearchTerms', tiles: [], next: null })
  const longQuery = 'a'.repeat(201)
  expect(await browseLoad(event(longQuery))).toMatchObject({ searchError: 'queryTooLong', query: longQuery, tiles: [], next: null })
  expect(await browseLoad(event('a'.repeat(200)))).toMatchObject({ searchError: null })
})

test('submission needs a picture or a link', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  const event = { request: { formData: async () => form }, url: new URL('https://example.test/en'), locals: {}, platform: { env: { DB: db, MEDIA: {} } }, getClientAddress: () => '127.0.0.1' } as any
  expect((await createActions.default(event) as any).data.error).toBe('evidence')
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

test('browse narrows by tag (including implied tags and legacy ?genre=), collection or label, and rejects malformed ones', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  form.set('place', 'A book'); form.set('url', 'https://example.test/source'); form.set('tags_present', '1'); form.set('tag', 'hakka'); form.set('tags', 'nom IRG')
  const create = { request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' } as any
  await expect(createActions.default(create)).rejects.toMatchObject({ status: 303 })
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('tag=hakka'))).toMatchObject({ tag: 'hakka', tiles: [{ id: 1 }] })
  expect(await browseLoad(event('genre=hakka'))).toMatchObject({ tag: 'hakka', tiles: [{ id: 1 }] })
  expect(await browseLoad(event('genre=dialect'))).toMatchObject({ tag: 'dialect', tiles: [{ id: 1 }] })
  expect(await browseLoad(event(`tag=${encodeURIComponent('越南')}`))).toMatchObject({ tag: '越南', tiles: [{ id: 1 }] })
  expect(await browseLoad(event('tag=IRG'))).toMatchObject({ tag: 'IRG', tiles: [{ id: 1 }] })
  expect(await browseLoad(event('tag=music'))).toMatchObject({ tiles: [] })
  await expect(browseLoad(event('tag=a%7Cb'))).rejects.toMatchObject({ status: 404 })
  await expect(browseLoad(event('genre=a%7Cb'))).rejects.toMatchObject({ status: 404 })
})

test('a new typed tag typed into the form without scripts is created with its implication and attached', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  form.set('place', 'A book'); form.set('url', 'https://example.test/source'); form.set('tags_present', '1')
  form.set('tag_new', '近古字書'); form.set('tag_new_type', 'domain'); form.set('tag_new_implies', 'hakka')
  const create = { request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' } as any
  await expect(createActions.default(create)).rejects.toMatchObject({ status: 303 })
  const platform = { env: { DB: db } }
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform }) as any
  for (const tag of [encodeURIComponent('近古字書'), 'hakka', 'dialect']) expect(await browseLoad(event(`tag=${tag}`))).toMatchObject({ tiles: [{ id: 1 }] })
  expect(((await browseLoad(event(''))) as any).tags).toContainEqual(expect.objectContaining({ name: '近古字書', label: '近古字書', type: 'domain', implies: ['hakka'], n: 1 }))
  // A bad target stops the record, and a tag label resolves to its canonical tag.
  const refused = new FormData()
  refused.set('place', 'A book'); refused.set('url', 'https://example.test/source'); refused.set('tag_new', '乙'); refused.set('tag_new_implies', '無')
  expect((await createActions.default({ ...create, request: { formData: async () => refused } }) as any).data.error).toBe('tag')
  const label = new FormData()
  label.set('place', 'A book'); label.set('url', 'https://example.test/source'); label.set('tag_new', '方言字')
  await expect(createActions.default({ ...create, request: { formData: async () => label } })).rejects.toMatchObject({ status: 303 })
  expect(await browseLoad(event('tag=dialect'))).toMatchObject({ tiles: [{ id: 2 }, { id: 1 }] })
  expect(((await tagsLoad({ platform } as any)) as any).tags.some((tag: { name: string }) => tag.name === '方言字')).toBe(false)
  await expect(categoriesLoad({ params: { locale: 'en' } } as any)).rejects.toMatchObject({ status: 301, location: '/en/tags' })
})

test('the tags endpoint creates, renames, moves, implies, unimplies, deletes and undoes a tag, and /tags reads them with recent changes', async () => {
  const { db } = openTestDb()
  const platform = { env: { DB: db } }
  const post = (body: Record<string, unknown>) => ({
    request: { json: async () => body },
    url: new URL('https://example.test/api/tags'),
    params: {},
    locals: {},
    platform,
    cookies: { set() {} },
    getClientAddress: () => '127.0.0.1',
  }) as any
  const answer = async (body: Record<string, unknown>) => {
    const response = await tagsApi.POST(post(body))
    return { status: response.status, body: await response.json() }
  }
  const rev = async (name: string) => (await tagList(db)).find(tag => tag.name === name)?.rev

  expect(await answer({ action: 'create', name: '戶籍用字', type: 'domain', implies: [] })).toMatchObject({ status: 200, body: { ok: true, value: '戶籍用字', created: true } })
  expect(await answer({ action: 'create', name: '寺院用字', type: 'domain', implies: ['戶籍用字'] })).toMatchObject({ status: 200, body: { ok: true, value: '寺院用字', created: true } })
  expect(await answer({ action: 'create', name: '客家語' })).toMatchObject({ status: 200, body: { ok: true, value: 'hakka', created: false } })
  expect((await answer({ action: 'create', name: '丙', implies: ['無'] })).status).toBe(400)
  expect((await answer({ action: 'create', name: 'a b' })).status).toBe(400)

  const read = await rev('寺院用字')
  expect(await answer({ action: 'move', name: '寺院用字', rev: read, type: 'meta' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'rename', name: '寺院用字', rev: read, label: '衝突' })).toMatchObject({ status: 409, body: { error: 'conflict' } })
  expect(await answer({ action: 'imply', name: 'dialect', target: 'hakka' })).toMatchObject({ status: 400, body: { error: 'cycle' } })
  expect(await answer({ action: 'imply', name: '寺院用字', rev: await rev('寺院用字'), target: 'music' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'unimply', name: '寺院用字', rev: await rev('寺院用字'), target: '戶籍用字' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'rename', name: '寺院用字', rev: await rev('寺院用字'), label: '寺社用字' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'rename', name: '寺院用字', rev: await rev('寺院用字'), label: '客家語' })).toMatchObject({ status: 409, body: { error: 'exists' } })
  expect(await answer({ action: 'delete', name: '戶籍用字', rev: await rev('戶籍用字') })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'delete', name: '戶籍用字', rev: 0 })).toMatchObject({ status: 404, body: { error: 'missing' } })
  expect((await answer({ action: 'hide', name: 'hakka' })).status).toBe(400)

  const deleted = ((await tagsLoad({ platform } as any)) as any).changes[0].id
  expect(await answer({ action: 'undo', id: deleted })).toMatchObject({ status: 200, body: { ok: true } })
  const page = (await tagsLoad({ platform } as any)) as any
  expect(page.tags).toContainEqual(expect.objectContaining({ name: '寺院用字', label: '寺社用字', type: 'meta', implies: ['music'], n: 0, used: false }))
  expect(page.tags).toContainEqual(expect.objectContaining({ name: '戶籍用字', type: 'domain', implies: [] }))
  expect(page.changes.slice(0, 7).map((change: { kind: string; name: string }) => [change.kind, change.name])).toEqual([
    ['create', '戶籍用字'], ['delete', '戶籍用字'], ['rename', '寺院用字'], ['unimply', '寺院用字'], ['imply', '寺院用字'], ['move', '寺院用字'], ['create', '寺院用字'],
  ])
  expect(page.changes[0].by_name).toMatch(/^anon-/)

  // Groups: made in a type, a tag placed in one, the group moved with its tag, and refused while it holds it.
  const made = await answer({ action: 'group.create', type: 'meta', label: '寺社' })
  expect(made).toMatchObject({ status: 200, body: { ok: true, groups: [{ type: 'meta', label: '寺社' }] } })
  const group = (made.body as { value: number }).value
  expect(await answer({ action: 'move', name: '寺院用字', rev: await rev('寺院用字'), group, index: 0 })).toMatchObject({ status: 200, body: { ok: true } })
  expect((await answer({ action: 'move', name: '寺院用字', group: 'x' })).status).toBe(400)
  const placed = (await tagsLoad({ platform } as any)) as any
  expect(placed.tags).toContainEqual(expect.objectContaining({ name: '寺院用字', type: 'meta', group }))
  expect(await answer({ action: 'group.move', id: group, type: 'domain', rev: placed.groups[0].rev })).toMatchObject({ status: 200, body: { ok: true } })
  expect(((await tagsLoad({ platform } as any)) as any).tags).toContainEqual(expect.objectContaining({ name: '寺院用字', type: 'domain', group }))
  expect(await answer({ action: 'group.delete', id: group })).toMatchObject({ status: 400, body: { error: 'used' } })
  expect(await answer({ action: 'create', name: '神社用字', group })).toMatchObject({ status: 200, body: { ok: true, created: true } })
  expect(((await tagsLoad({ platform } as any)) as any).tags).toContainEqual(expect.objectContaining({ name: '神社用字', type: 'domain', group }))

  // Merging leaves the merged name as an alias that browsing still finds; an alias is given and taken off.
  expect(await answer({ action: 'merge', name: '神社用字', into: '寺院用字', rev: await rev('神社用字'), intoRev: await rev('寺院用字') })).toMatchObject({ status: 200, body: { ok: true } })
  expect(((await tagsLoad({ platform } as any)) as any).tags).toContainEqual(expect.objectContaining({ name: '寺院用字', aliases: ['神社用字'] }))
  expect(await browseLoad({ url: new URL(`https://example.test/en?tag=${encodeURIComponent('神社用字')}`), locals: { glyphStyle: 'sans' }, platform } as any)).toMatchObject({ tag: '寺院用字' })
  expect(await answer({ action: 'merge', name: '寺院用字', into: '神社用字' })).toMatchObject({ status: 400, body: { error: 'target' } })
  expect(await answer({ action: 'alias', name: '寺院用字', alias: '神社用字' })).toMatchObject({ status: 409, body: { error: 'aliased' } })
  expect(await answer({ action: 'alias', name: '寺院用字', alias: '寺用字' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'unalias', alias: '寺用字' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'name', name: '寺院用字', locale: 'en', label: 'Temple characters' })).toMatchObject({ status: 200, body: { ok: true } })
  expect(await answer({ action: 'name', subject: 'group', id: group, locale: 'ja', label: '寺社' })).toMatchObject({ status: 200, body: { ok: true } })
  const named = (await tagsLoad({ platform } as any)) as any
  expect(named.tags).toContainEqual(expect.objectContaining({ name: '寺院用字', names: { en: 'Temple characters' } }))
  expect(named.groups).toContainEqual(expect.objectContaining({ id: group, names: { ja: '寺社' } }))
})

test('the radicals page lists the radicals in use, browse narrows by one and the record names it', async () => {
  const { db } = openTestDb()
  for (const [ids, radical] of [['⿺克卡', ''], ['⿰口男', ''], ['⿸ㄏ·', 'ㄏ']]) {
    const form = new FormData()
    form.set('place', 'A book'); form.set('url', 'https://example.test/source'); form.append('ids', ids); form.set('radical', radical)
    const create = { request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' } as any
    await expect(createActions.default(create)).rejects.toMatchObject({ status: 303 })
  }
  const platform = { env: { DB: db } }
  expect(await radicalsLoad({ platform } as any)).toEqual({ groups: [{ strokes: 2, radicals: [{ path: '儿', radical: '儿', records: 1, branches: [] }] }, { strokes: 3, radicals: [{ path: '口', radical: '口', records: 1, branches: [] }] }, { strokes: null, radicals: [{ path: 'ㄏ', radical: 'ㄏ', records: 1, branches: [] }] }] })
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform }) as any
  expect(await browseLoad(event(`radical=${encodeURIComponent('儿兄克')}`))).toMatchObject({ radical: '儿兄克', tiles: [{ id: 1 }] })
  expect(await browseLoad(event(`radical=${encodeURIComponent('口')}`))).toMatchObject({ tiles: [{ id: 2 }] })
  expect(await browseLoad(event(`radical=${encodeURIComponent('ㄏ')}`))).toMatchObject({ tiles: [{ id: 3 }] })
  await expect(browseLoad(event(`radical=${encodeURIComponent('克')}`))).rejects.toMatchObject({ status: 404 })
  expect(await detailLoad({ params: { id: '3', locale: 'en' }, url: new URL('https://example.test/en/entry/3'), locals: { person: null }, platform } as any)).toMatchObject({ filed: [{ path: 'ㄏ', radical: 'ㄏ' }] })
  expect(await detailLoad({ params: { id: '1', locale: 'en' }, url: new URL('https://example.test/en/entry/1'), locals: { person: null }, platform } as any)).toMatchObject({ filed: [{ path: '儿', radical: '儿' }] })
})

test('a record code typed into search opens its record', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026'); INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at, merged_into) VALUES (34, 'han', 'p', '2026', '2026', NULL, NULL), (35, 'han', 'p', '2026', '2026', 'hidden', NULL), (36, 'han', 'p', '2026', '2026', NULL, 34), (37, 'han', 'p', '2026', '2026', NULL, 35)")
  const at = (search: string) => ({ url: new URL(`https://example.test/ja?${search}`), params: { locale: 'ja' }, locals: { person: null, glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  const event = (q: string) => at(`q=${encodeURIComponent(q)}`)
  for (const q of ['R+0022', 'r+0022', '天天玄玄']) await expect(browseLoad(event(q))).rejects.toMatchObject({ status: 303, location: '/ja/entry/34' })
  // A plus sign left bare in the address arrives as a space.
  await expect(browseLoad(at('q=R+0022'))).rejects.toMatchObject({ status: 303, location: '/ja/entry/34' })
  // A merged record opens the record it was merged into.
  await expect(browseLoad(event('R+0024'))).rejects.toMatchObject({ status: 303, location: '/ja/entry/34' })
  // A code of a hidden record, of one merged into a hidden record, or of none, is searched as text.
  for (const q of ['R+0023', '天天玄黃', 'R+0025', 'R+0999']) expect(await browseLoad(event(q))).toMatchObject({ tiles: [] })
  // A later page of results is never left for a record.
  expect(await browseLoad(at('q=R%2B0022&after=0.100'))).toMatchObject({ tiles: [] })
})

test('a shuffled browse list is dealt a start and keeps it', async () => {
  const { db } = openTestDb()
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  const dealt = await Promise.resolve(browseLoad(event('sort=random&filter=variant'))).catch((thrown: any) => thrown)
  expect(dealt).toMatchObject({ status: 302 })
  expect(dealt.location).toMatch(/^\/en\?sort=random&filter=variant&seed=\d+$/)
  expect(await browseLoad(event('sort=random&seed=12'))).toMatchObject({ order: 'random', seed: 12, tiles: [] })
})

test('browse keeps to the decade a record was first seen in, and rejects one that is no decade', async () => {
  const { db } = openTestDb()
  const form = new FormData()
  form.set('place', 'A book'); form.set('url', 'https://example.test/source'); form.set('report_date', '1937年5月')
  const create = { request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, cookies: { set() {} }, getClientAddress: () => '127.0.0.1' } as any
  await expect(createActions.default(create)).rejects.toMatchObject({ status: 303 })
  const event = (query: string) => ({ url: new URL(`https://example.test/en?${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  expect(await browseLoad(event('decade=1930'))).toMatchObject({ decade: '1930', tiles: [{ id: 1 }] })
  expect(await browseLoad(event('decade=1930&sort=earliest'))).toMatchObject({ tiles: [{ id: 1 }] })
  expect(await browseLoad(event('decade=1940'))).toMatchObject({ tiles: [] })
  // A year read from 「0012」 is 12, so the decades below 100 are decades too.
  for (const query of ['decade=0', 'decade=10', 'decade=990']) expect(await browseLoad(event(query))).toMatchObject({ tiles: [] })
  for (const query of ['decade=1937', 'decade=00', 'decade=05', 'decade=19300', 'decade=abc']) await expect(browseLoad(event(query))).rejects.toMatchObject({ status: 404 })
})

test('the chronology starts at the first decade, and answers a start that is no decade with 404', async () => {
  const { db } = openTestDb()
  const event = (query: string) => ({ url: new URL(`https://example.test/en/chronology${query}`), locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } }) as any
  expect(await chronologyLoad(event(''))).toMatchObject({ decades: [], entries: [], dated: 0, undated: 0 })
  expect(await chronologyLoad(event('?from=1930'))).toMatchObject({ entries: [], earlier: null, later: null })
  expect(await chronologyLoad(event('?at=1935.4'))).toMatchObject({ entries: [] })
  expect(await chronologyLoad(event('?before=1935.4'))).toMatchObject({ entries: [], earlier: null, later: null })
  for (const query of ['?from=1935', '?from=x', '?from=05', '?at=1935', '?at=1935.0', '?before=x']) await expect(chronologyLoad(event(query))).rejects.toMatchObject({ status: 404 })
})
