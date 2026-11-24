import { afterEach, expect, test } from 'bun:test'
import { createPerson, joinAtlas, startSession } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { GET } from './people/[id]/picture/+server'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
function answering(response: () => Response) {
  const asked: string[] = []
  globalThis.fetch = (async (url: URL) => { asked.push(url.href); return response() }) as unknown as typeof fetch
  return asked
}
const ask = async (db: D1Database, id: string, issuer: string | undefined = 'https://atlas.example/api/auth') => await GET({
  params: { id }, url: new URL(`https://rare.example/api/people/${id}/picture`), platform: { env: { DB: db, ATLAS_ISSUER: issuer } },
} as any)
const png = (bytes: Uint8Array = PNG, type = 'image/png') => () => new Response(bytes as BodyInit, { headers: { 'content-type': type } })

test('a person who signed in is shown by the picture of their account, whose id is not in the answer', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db, 'atlas-1', 'Person')
  const asked = answering(png())
  const response = await ask(db, person.id)
  expect(asked).toEqual(['https://atlas.example/api/avatars/atlas-1'])
  expect([response.status, response.headers.get('content-type'), response.headers.get('cache-control')]).toEqual([200, 'image/png', 'public, max-age=3600'])
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  expect(JSON.stringify([...response.headers])).not.toContain('atlas-1')
})

test('nothing is asked for a person who has no account, is banned, has joined another or does not exist', async () => {
  const { db, raw } = openTestDb()
  const asked = answering(png())
  const anon = await createPerson(db), banned = await createPerson(db, 'atlas-2', 'Banned')
  raw.prepare("UPDATE people SET banned_at = '2026' WHERE id = ?").run(banned.id)
  const joined = await createPerson(db), account = await createPerson(db, 'atlas-3', 'Account')
  expect(await joinAtlas(db, joined, 'atlas-3', 'Account', await startSession(db, joined.id))).toBe(account.id)
  for (const id of [anon.id, banned.id, joined.id, 'ffffffffffff']) expect((await ask(db, id)).status).toBe(404)
  await expect(ask(db, '../x')).rejects.toMatchObject({ status: 404 })
  expect((await ask(db, account.id, '')).status).toBe(404)
  expect(asked).toEqual([])
})

test('a person of the first days, who holds a UUID, is shown too', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, atlas_sub, created_at) VALUES ('00000000-0000-4000-8000-000000000001', 'First', 'atlas-6', '2026')")
  answering(png())
  expect((await ask(db, '00000000-0000-4000-8000-000000000001')).status).toBe(200)
})

test('an account without a usable picture is remembered as such, and a refusal or a delay is not', async () => {
  const { db } = openTestDb()
  const { id } = await createPerson(db, 'atlas-4', 'Person')
  const outcomes: [() => Response, number, string][] = [
    [() => new Response('Not found', { status: 404 }), 404, 'public, max-age=300'],
    [png(PNG, 'image/svg+xml'), 404, 'public, max-age=300'],
    [png(PNG, 'text/html'), 404, 'public, max-age=300'],
    [png(new Uint8Array(1024 * 1024 + 1)), 404, 'public, max-age=300'],
    [() => new Response('Too many', { status: 429 }), 502, 'no-store'],
    [() => new Response('Down', { status: 503 }), 502, 'no-store'],
    [() => { throw new DOMException('late', 'TimeoutError') }, 502, 'no-store'],
  ]
  for (const [response, status, control] of outcomes) {
    answering(response)
    const answer = await ask(db, id)
    expect([answer.status, answer.headers.get('cache-control')]).toEqual([status, control])
  }
})

test('a picture already kept at the edge is served again without asking, until its person is banned', async () => {
  const { db, raw } = openTestDb()
  const { id } = await createPerson(db, 'atlas-5', 'Person')
  const globals = globalThis as unknown as { caches?: unknown }
  const original = globals.caches
  const kept = new Map<string, Response>()
  const waiting: Promise<unknown>[] = []
  globals.caches = { default: { match: async (request: Request) => kept.get(request.url)?.clone(), put: async (request: Request, response: Response) => { kept.set(request.url, response) } } }
  try {
    const asked = answering(png())
    const event = { params: { id }, url: new URL(`https://rare.example/api/people/${id}/picture?x=1`), platform: { env: { DB: db, ATLAS_ISSUER: 'https://atlas.example/api/auth' }, ctx: { waitUntil: (work: Promise<unknown>) => waiting.push(work) } } } as any
    await GET(event)
    await Promise.all(waiting)
    const again = await GET(event)
    expect([again.status, asked.length]).toEqual([200, 1])
    raw.exec("UPDATE people SET banned_at = '2026'")
    expect((await GET(event)).status).toBe(404)
    expect([...kept.keys()]).toEqual([`https://rare.example/api/people/${id}/picture`])
  } finally { globals.caches = original }
})
