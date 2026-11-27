import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { createEntry, getEntry, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { POST } from './+server'

const baseSighting: SightingFields = {
  place: 'Seed', url: 'https://example.test/seed', title: 'Seed', author: null, publisher: null,
  report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null,
  contexts: null, style: null, types: null, note: null, quotes: null,
}

const fakeR2 = () => ({ put: async () => {}, get: async () => null }) as unknown as R2Bucket

function call(body: string, options: { token?: string; configured?: string; paused?: string; db: D1Database; atlas?: Fetcher }) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  const request = new Request('https://rare.glyphatlas.org/api/sync/atlas', { method: 'POST', headers, body })
  return POST({
    request,
    url: new URL(request.url),
    platform: {
      env: {
        DB: options.db,
        MEDIA: fakeR2(),
        ATLAS: options.atlas,
        ATLAS_ORIGIN: 'https://glyphatlas.org',
        ATLAS_SYNC_TOKEN: options.configured,
        WRITES_PAUSED: options.paused,
      },
      ctx: { waitUntil: () => {} },
    },
  } as any)
}

test('POST /api/sync/atlas hides behind 404 without token, rejects bad auth and paused writes, and syncs on valid auth', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db, null, 'Recorder')
  const entryId = await createEntry(db, { description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿰山東')] }, baseSighting, [], { actor: person.id, ip: null })

  await expect(call('{}', { db })).rejects.toMatchObject({ status: 404 })

  const unauth = await call('{}', { db, configured: 'sync-secret', token: 'wrong-secret' })
  expect(unauth.status).toBe(401)

  const paused = await call('{}', { db, configured: 'sync-secret', token: 'sync-secret', paused: '1' })
  expect(paused.status).toBe(503)

  const badJson = await call('{not json', { db, configured: 'sync-secret', token: 'sync-secret' })
  expect(badJson.status).toBe(400)

  const badId = await call(JSON.stringify({ entryId: -1 }), { db, configured: 'sync-secret', token: 'sync-secret' })
  expect(badId.status).toBe(400)

  const atlas = {
    async fetch(req: Request) {
      const url = new URL(req.url)
      if (url.pathname === '/layers/occurrences') return Response.json({ items: [{ id: 'crop-api-1', state: 'checked', document: 'book-api', year: 1690, origin: 'local' }] })
      if (url.pathname === '/layers/candidates') return Response.json({ items: [] })
      if (url.pathname === '/atlas/characters/crop-api-1') return Response.json({ id: 'crop-api-1', state: 'checked', document: 'book-api', source: 'API Book', year: 1690 })
      return new Response(null, { status: 404 })
    },
  } as unknown as Fetcher

  const ok = await call(JSON.stringify({ entryId }), { db, configured: 'sync-secret', token: 'sync-secret', atlas })
  expect(ok.status).toBe(200)
  const payload = await ok.json() as any
  expect(payload.processed).toBe(1)
  expect(payload.added).toBe(1)
  expect(payload.results[0].cropIds).toEqual(['crop-api-1'])
  expect((await getEntry(db, entryId))!.sightings).toHaveLength(2)
})
