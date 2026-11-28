import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { createPerson, SESSION_COOKIE, startSession } from '$lib/server/people'
import { handle } from '../../hooks.server'
import { GET as getIds, POST as postFavourite } from './favourites/+server'
import { GET as getEntries } from './favourites/entries/+server'
import { load as layoutLoad } from '../+layout.server'
import { load as favouritesPageLoad } from '../[locale]/favourites/+page.server'

function setup() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p1', 'Person', '2026');
    INSERT INTO entries(id, ids, sightings, created_by, created_at, updated_at) VALUES
      (1, '⿰木木', 1, 'p1', '2026', '2026'),
      (2, '⿰火火', 2, 'p1', '2026', '2026');`)
  const jar = new Map<string, string>()
  const cookies = {
    get: (k: string) => jar.get(k),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }
  const makeEvent = (path: string, init: RequestInit = {}, envExtra: Record<string, unknown> = {}, person: unknown = null) => ({
    url: new URL(path, 'https://example.test'),
    request: new Request(new URL(path, 'https://example.test'), { headers: { origin: 'https://example.test', ...init.headers }, ...init }),
    cookies,
    locals: { person, theme: 'system', glyphStyle: 'sans', tileSize: 145 },
    params: { locale: 'en' },
    route: { id: path.startsWith('/api/favourites') ? '/api/favourites' : '/[locale]/favourites' },
    platform: { env: { DB: db, ...envExtra } },
    getClientAddress: () => '127.0.0.1',
  }) as any
  return { db, raw, jar, makeEvent }
}

test('reading favourites without a session starts no person and stores nothing', async () => {
  const { raw, jar, makeEvent } = setup()
  const idsResponse = await getIds(makeEvent('/api/favourites'))
  expect(idsResponse.status).toBe(200)
  expect(idsResponse.headers.get('cache-control')).toBe('private, no-store')
  expect(await idsResponse.json()).toEqual({ ids: [] })

  const entriesResponse = await getEntries(makeEvent('/api/favourites/entries'))
  expect(entriesResponse.status).toBe(200)
  expect(entriesResponse.headers.get('cache-control')).toBe('private, no-store')
  expect(await entriesResponse.json()).toEqual({ tiles: [], glyphs: {}, total: 0, offset: 0, next: null })

  expect(await favouritesPageLoad(makeEvent('/en/favourites'))).toEqual({ tiles: [], glyphs: {}, total: 0, offset: 0, next: null })
  expect(jar.size).toBe(0)
  expect(raw.query('SELECT count(*) AS n FROM people').get()).toEqual({ n: 1 })
})

test('starring creates an anonymous session on first write and reflects across API, layout and page loads', async () => {
  const { raw, jar, makeEvent } = setup()

  // Missing entry or unstar when unauthenticated creates no anonymous person.
  expect((await postFavourite(makeEvent('/api/favourites', { method: 'POST', body: JSON.stringify({ entry: 99, favourite: true }) }))).status).toBe(404)
  expect((await postFavourite(makeEvent('/api/favourites', { method: 'POST', body: JSON.stringify({ entry: 1, favourite: false }) }))).status).toBe(200)
  expect(jar.size).toBe(0)
  expect(raw.query('SELECT count(*) AS n FROM people').get()).toEqual({ n: 1 })

  // Cross-origin POST is rejected.
  const crossOrigin = await postFavourite(makeEvent('/api/favourites', { method: 'POST', headers: { origin: 'https://evil.test' }, body: JSON.stringify({ entry: 1, favourite: true }) }))
  expect(crossOrigin.status).toBe(403)

  // First star starts an anonymous person and session cookie.
  const firstEvent = makeEvent('/api/favourites', { method: 'POST', body: JSON.stringify({ entry: 1, favourite: true }) })
  const firstRes = await postFavourite(firstEvent)
  expect(firstRes.status).toBe(200)
  expect(await firstRes.json()).toEqual({ entry: 1, favourite: true })
  expect(jar.has(SESSION_COOKIE)).toBe(true)
  const anon = firstEvent.locals.person
  expect(anon?.id).toBeTruthy()

  // Star a second entry as the same person.
  const secondRes = await postFavourite(makeEvent('/api/favourites', { method: 'POST', body: JSON.stringify({ entry: 2, favourite: true }) }, {}, anon))
  expect(secondRes.status).toBe(200)

  const listIds = await (await getIds(makeEvent('/api/favourites', {}, {}, anon))).json()
  expect(listIds).toEqual({ ids: [2, 1] })

  const listPage = await (await getEntries(makeEvent('/api/favourites/entries?offset=0&limit=1', {}, {}, anon))).json() as { tiles: { id: number }[]; total: number; offset: number; next: number | null }
  expect(listPage.tiles.map(t => t.id)).toEqual([2])
  expect(listPage.total).toBe(2)
  expect(listPage.next).toBe(1)

  const layout = await layoutLoad(makeEvent('/en/entry/1', {}, {}, anon) as any)
  expect(layout.favourites).toEqual([2, 1])

  const page = await favouritesPageLoad(makeEvent('/en/favourites', {}, {}, anon)) as { tiles: { id: number }[]; total: number }
  expect(page.tiles.map(t => t.id)).toEqual([2, 1])
  expect(page.total).toBe(2)

  // Unstar entry 2.
  const unstarRes = await postFavourite(makeEvent('/api/favourites', { method: 'POST', body: JSON.stringify({ entry: 2, favourite: false }) }, {}, anon))
  expect(await unstarRes.json()).toEqual({ entry: 2, favourite: false })
  expect(await (await getIds(makeEvent('/api/favourites', {}, {}, anon))).json()).toEqual({ ids: [1] })
})

test('hook guards /api/favourites writes against pause, ban and rate limits while allowing reads', async () => {
  const { db, raw, jar, makeEvent } = setup()
  const person = await createPerson(db)
  jar.set(SESSION_COOKIE, await startSession(db, person.id))

  const run = async (method: 'GET' | 'POST', envExtra: Record<string, unknown> = {}) => {
    const event = makeEvent('/api/favourites', { method, body: method === 'POST' ? JSON.stringify({ entry: 1, favourite: true }) : undefined }, envExtra)
    return handle({ event, resolve: (e: any) => method === 'GET' ? getIds(e) : postFavourite(e) } as any)
  }

  await expect(run('POST', { WRITES_PAUSED: '1' })).rejects.toMatchObject({ status: 503 })
  expect((await run('GET', { WRITES_PAUSED: '1' })).status).toBe(200)
  await expect(run('POST', { EDITS: { limit: async () => ({ success: false }) } })).rejects.toMatchObject({ status: 429 })

  raw.prepare("UPDATE people SET banned_at = '2026' WHERE id = ?").run(person.id)
  await expect(run('POST')).rejects.toMatchObject({ status: 403 })
  expect((await run('GET')).status).toBe(200)
})

test('entries endpoint validates pagination query parameters', async () => {
  const { makeEvent } = setup()
  await expect(getEntries(makeEvent('/api/favourites/entries?offset=-1'))).rejects.toMatchObject({ status: 400 })
  await expect(getEntries(makeEvent('/api/favourites/entries?limit=0'))).rejects.toMatchObject({ status: 400 })
  await expect(getEntries(makeEvent('/api/favourites/entries?offset=abc'))).rejects.toMatchObject({ status: 400 })
})
