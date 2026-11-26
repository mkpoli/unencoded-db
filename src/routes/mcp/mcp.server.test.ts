import { afterEach, expect, test } from 'bun:test'
import { handle } from '../../hooks.server'
import { openTestDb } from '$lib/server/testdb'
import { mergeEntry } from '$lib/server/entries'
import { personOf } from '$lib/server/people'
import { FETCHES_MAX } from './_tools.server'
import { POST } from './+server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])
const ORIGIN = 'https://example.test'
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// Every picture address answers the same small PNG unless a test says otherwise.
function pictures(answer: (url: string) => Response = () => new Response(png, { headers: { 'content-type': 'image/png' } })) {
  const asked: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => { asked.push(String(input)); return answer(String(input)) }) as typeof fetch
  return asked
}

function fixture(bindings: Record<string, unknown> = {}) {
  const { db, raw } = openTestDb()
  const objects = new Map<string, Uint8Array>()
  // `weighs` makes the store report another size for its objects, and `opened` counts the ones read.
  const store = { weighs: null as number | null, opened: 0 }
  const MEDIA = {
    put: async (key: string, bytes: Uint8Array) => { objects.set(key, bytes) },
    get: async (key: string) => objects.has(key) ? { size: store.weighs ?? objects.get(key)!.byteLength, arrayBuffer: async () => { store.opened++; return objects.get(key)!.buffer } } : null,
  }
  let next = 1
  // A request as the Worker receives it: through the hook, then the endpoint.
  const send = async (body: unknown, headers: Record<string, string> = {}) => {
    const request = new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
    const event = {
      request, url: new URL(request.url), route: { id: '/mcp' }, params: {}, locals: {}, cookies: { get: () => undefined },
      platform: { env: { DB: db, MEDIA, ...bindings } }, getClientAddress: () => '127.0.0.1',
    }
    return handle({ event, resolve: (resolved: any) => POST(resolved) } as any)
  }
  const call = async (name: string, args: unknown, session?: string) => {
    const response = await send({ jsonrpc: '2.0', id: next++, method: 'tools/call', params: { name, arguments: args } }, session ? { 'mcp-session-id': session } : {})
    const { result } = await response.json() as any
    return { failed: Boolean(result.isError), value: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) }
  }
  const count = (table: string) => (raw.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
  const connect = async () => (await send({ jsonrpc: '2.0', id: next++, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })).headers.get('mcp-session-id')!
  return { db, raw, objects, store, send, call, count, connect }
}

const sighting = { place: 'A shop sign', url: 'https://example.test/sign' }

test('a connection is opened with the revision asked for and a token of its own', async () => {
  const { send, count } = fixture()
  const open = (protocolVersion: string) => send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
  const first = await open('2025-06-18'), second = await open('2099-01-01')
  expect((await first.json() as any).result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'rare-character-compendium' } })
  expect((await second.json() as any).result.protocolVersion).toBe('2025-11-25')
  expect(first.headers.get('mcp-session-id')).toMatch(/^[0-9a-f]{64}$/)
  expect(second.headers.get('mcp-session-id')).not.toBe(first.headers.get('mcp-session-id'))
  // Nothing is kept for a connection until it writes.
  expect(count('people')).toBe(0)
  expect(count('sessions')).toBe(0)
})

test('the protocol answers its own methods and refuses the rest', async () => {
  const { send } = fixture()
  expect((await send({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
  expect(await (await send({ jsonrpc: '2.0', id: 'a', method: 'ping' })).json()).toEqual({ jsonrpc: '2.0', id: 'a', result: {} })
  const { result } = await (await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json() as any
  expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual(['find_similar_records', 'search_records', 'get_record', 'add_record', 'add_sighting', 'edit_record', 'edit_sighting'])
  expect(result.tools.every((tool: Record<string, unknown>) => !('run' in tool) && (tool.inputSchema as any).type === 'object')).toBe(true)
  expect((await (await send({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).json() as any).error.code).toBe(-32601)
  expect((await (await send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'drop_everything' } })).json() as any).error.code).toBe(-32602)
  expect((await send('{')).status).toBe(400)
  expect((await send([{ jsonrpc: '2.0', id: 5, method: 'ping' }])).status).toBe(400)
  expect((await send({ jsonrpc: '2.0', id: 6, method: 'ping' }, { 'mcp-protocol-version': '2024-11-05' })).status).toBe(400)
})

test('a page of another site cannot post here', async () => {
  const { send, call, count } = fixture()
  const add = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'add_record', arguments: { ids: ['⿰山東'], sightings: [sighting] } } }
  expect((await send(add, { origin: 'https://evil.example' })).status).toBe(403)
  // A body a browser sends without asking first is a form's, and stops at the site's own rule for forms.
  expect((await send(add, { 'content-type': 'text/plain' })).status).toBe(403)
  expect((await send(add, { 'content-type': 'application/xml' })).status).toBe(415)
  expect(count('entries')).toBe(0)
  expect((await send(add, { origin: ORIGIN })).status).toBe(200)
  expect(count('entries')).toBe(1)
  expect((await call('get_record', { record: '1' })).failed).toBe(false)
})

test('a record is added with its claims, sightings and fetched pictures', async () => {
  const { call, raw, objects, count } = fixture()
  const asked = pictures()
  const added = await call('add_record', {
    script: 'han', ids: ['⿰山東', '⿰山⿻日木'], description: 'On a shop sign.',
    meanings: [{ text: 'mountain pass', evidence: [2] }],
    readings: [{ text: 'tōge', doculect: 'ja', meanings: [1], evidence: [1, 2] }],
    creators: [{ name: '陸貫一', evidence: [2] }],
    encodings: [{ charset: 'unicode', code: 'U+5D20' }],
    related: [{ character: '峠', relationship: 'variant', difference: 'right side', readings: [1] }],
    categories: ['kokuji'], tags: ['signage'],
    sightings: [
      { ...sighting, pictures: [{ url: 'https://img.example/sign.png', marks: [[1, 1, 6, 6]] }] },
      { place: 'A dictionary', title: 'Book', author: 'Someone', report_date: '1936', page: '12', types: ['definition', 'reading'], contexts: ['running_text', 'heading'], vias: [{ url: 'https://example.test/post/1', author: '@poster', publisher: 'X', report_date: '2026-11-14', container: null, source_kind: null, quote: '書影 p. 3' }] },
    ],
  })
  expect(added).toEqual({ failed: false, value: { id: 1, code: 'R+0001', url: `${ORIGIN}/entry/1` } })
  expect(asked).toEqual(['https://img.example/sign.png'])
  expect(objects.size).toBe(1)
  expect(raw.query('SELECT ids, script, status, sightings, first_year FROM entries').get()).toEqual({ ids: '⿰山東', script: 'han', status: 'encoded', sightings: 2, first_year: '1936' })
  expect(raw.query('SELECT box, image_w FROM sighting_media').get()).toEqual({ box: '[[1,1,6,6]]', image_w: 10 })
  const claims = raw.query('SELECT key, kind, value, sightings, under FROM claims ORDER BY position').all() as { key: string; kind: string; value: string; sightings: string; under: string }[]
  expect(claims.map(claim => [claim.kind, claim.value])).toEqual([['ids', '⿰山東'], ['ids', '⿰山⿻日木'], ['reading', 'tōge'], ['meaning', 'mountain pass'], ['encoding', 'U+5D20'], ['relation', '峠'], ['tag', 'kokuji'], ['tag', 'signage'], ['creator', '陸貫一']])
  const of = (kind: string) => claims.find(claim => claim.kind === kind)!
  expect(JSON.parse(of('meaning').sightings)).toEqual([2])
  expect(JSON.parse(of('reading').sightings)).toEqual([1, 2])
  expect(JSON.parse(of('reading').under)).toEqual([of('meaning').key])
  expect(JSON.parse(of('relation').under)).toEqual([of('reading').key])
  expect(count('sighting_vias')).toBe(1)
  expect(raw.query('SELECT quote FROM sighting_vias').get()).toEqual({ quote: '書影 p. 3' })
  expect(raw.query("SELECT kind FROM revisions ORDER BY id").all()).toEqual([{ kind: 'create' }, { kind: 'sighting' }, { kind: 'sighting' }])

  const read = await call('get_record', { record: 'R+0001' })
  expect(read.value).toMatchObject({
    id: 1, script: 'han', status: 'encoded', description: 'On a shop sign.',
    sightings: [
      { id: 1, place: 'A shop sign', pictures: [{ url: expect.stringMatching(/^https:\/\/example\.test\/media\/v2\/[a-f0-9]{64}\.png$/), width: 10, height: 10, marks: [[1, 1, 6, 6]] }] },
      { id: 2, title: 'Book', contexts: ['running_text', 'heading'], types: ['definition', 'reading'], vias: [{ url: 'https://example.test/post/1', author: '@poster', quote: '書影 p. 3' }] },
    ],
  })
  expect(read.value.claims.find((claim: { kind: string }) => claim.kind === 'reading')).toMatchObject({ value: 'tōge', data: { doculect: 'ja' }, evidence: [1, 2] })
})

test('a form that cannot be described is added without ids', async () => {
  const { call, raw } = fixture()
  const added = await call('add_record', { script: 'sawndip', sightings: [sighting] })
  expect(added.failed).toBe(false)
  expect(raw.query('SELECT ids, script FROM entries').all()).toEqual([{ ids: null, script: 'sawndip' }])
  expect(raw.query("SELECT count(*) AS n FROM claims WHERE kind = 'ids'").get()).toEqual({ n: 0 })
  expect((await call('get_record', { record: 1 })).value.claims).toEqual([])
  expect(await call('add_record', { ids: [], sightings: [sighting] })).toMatchObject({ failed: true })
})

test('a connection writes under one anonymous name', async () => {
  const { call, raw, count, connect } = fixture()
  const one = await connect(), other = await connect()
  await call('add_record', { ids: ['⿰山東'], sightings: [sighting] }, one)
  await call('add_record', { ids: ['⿰山西'], sightings: [sighting] }, one)
  await call('add_sighting', { record: 1, url: 'https://example.test/again' }, one)
  await call('add_record', { ids: ['⿰山南'], sightings: [sighting] }, other)
  // A token that is no token of this site names no one.
  await call('add_record', { ids: ['⿰山北'], sightings: [sighting] }, 'guess')
  const authors = raw.query('SELECT created_by FROM entries ORDER BY id').all().map((row: any) => row.created_by as string)
  expect(authors[1]).toBe(authors[0])
  expect(new Set(authors).size).toBe(3)
  expect(count('people')).toBe(3)
  expect(count('sessions')).toBe(2)
  expect(raw.query('SELECT DISTINCT created_by FROM sightings WHERE entry_id = 1').all()).toEqual([{ created_by: authors[0] }])
})

test('a connection\'s token is no browser session', async () => {
  const { call, db, count, connect } = fixture()
  const token = await connect()
  await call('add_record', { ids: ['⿰山東'], sightings: [sighting] }, token)
  expect(count('sessions')).toBe(1)
  // Sent as the cookie, the token names no one, so it cannot be signed in to an account.
  expect(await personOf(db, token)).toBeNull()
  expect(await personOf(db, `mcp:${token}`)).toMatchObject({ atlas: false })
})

test('two first writes of one connection share its person, and an expired token starts over', async () => {
  const { call, raw, count, connect } = fixture()
  const token = await connect()
  await Promise.all([call('add_record', { ids: ['⿰山東'], sightings: [sighting] }, token), call('add_record', { ids: ['⿰山西'], sightings: [sighting] }, token)])
  expect(count('people')).toBe(1)
  expect(raw.query('SELECT count(DISTINCT created_by) AS n FROM entries').get()).toEqual({ n: 1 })

  raw.exec("UPDATE sessions SET created_at = '2020-01-01T00:00:00.000Z'")
  await call('add_record', { ids: ['⿰山南'], sightings: [sighting] }, token)
  await call('add_record', { ids: ['⿰山北'], sightings: [sighting] }, token)
  expect(count('people')).toBe(2)
  expect(count('sessions')).toBe(1)
  const authors = raw.query('SELECT created_by FROM entries ORDER BY id').all().map((row: any) => row.created_by as string)
  expect(authors[3]).toBe(authors[2])
  expect(authors[2]).not.toBe(authors[0])
})

test('what cannot be saved is refused whole', async () => {
  const { call, count, objects } = fixture()
  const asked = pictures(url => url.endsWith('.txt') ? new Response('not a picture') : url.endsWith('.gone') ? new Response('', { status: 404 }) : new Response(png))
  const refused = async (args: Record<string, unknown>) => { const answer = await call('add_record', { ids: ['⿰山東'], sightings: [sighting], ...args }); expect(answer.failed).toBe(true); return answer.value as string }
  expect(await refused({ sightings: [] })).toContain('at least one sighting')
  expect(await refused({ sightings: [{ place: 'A sign' }] })).toContain('Sighting 1')
  expect(await refused({ sightings: Array(6).fill(sighting) })).toContain('up to 5')
  expect(await refused({ ids: ['⿰山'] })).toContain('Not an ideographic description sequence')
  expect(await refused({ ids: ['峠'] })).toContain('Not an ideographic description sequence')
  expect(await refused({ sightings: [{ ...sighting, url: 'javascript:alert(1)' }] })).toContain('http')
  expect(await refused({ sightings: [{ ...sighting, contexts: ['billboard'] }] })).toContain('contexts is one of')
  expect(await refused({ sightings: [{ ...sighting, types: ['proof'] }] })).toContain('types is one of')
  expect(await refused({ meanings: [{ text: 'pass', evidence: [2] }] })).toContain('from 1 to 1')
  expect(await refused({ readings: [{ text: 'tōge', meanings: [1] }] })).toContain('from 1 to 0')
  expect(await refused({ related: [{ character: '峠', relationship: 'cousin' }] })).toContain('relationship is one of')
  expect(await refused({ categories: ['poetry'] })).toContain('categories is one of')
  expect(await refused({ encodings: [{ charset: '', code: 'U+5D20' }] })).toContain('character set')
  expect(await refused({ ivd: 'U+4E00' })).toContain('IVD')
  // A picture that fails after another was fetched leaves neither behind.
  expect(await refused({ sightings: [{ ...sighting, pictures: [{ url: 'https://img.example/a.png' }, { url: 'https://img.example/b.txt' }] }] })).toContain('b.txt')
  expect(await refused({ sightings: [{ ...sighting, pictures: [{ url: 'https://img.example/c.gone' }] }] })).toContain('404')
  expect(await refused({ sightings: [{ ...sighting, pictures: [{ url: 'ftp://img.example/a.png' }] }] })).toContain('http')
  expect(await refused({ sightings: [{ ...sighting, pictures: [{ url: 'https://img.example/a.png', marks: [[0, 0, 2, 2]] }] }] })).toContain('10 × 10')
  expect(asked).not.toContain('ftp://img.example/a.png')
  expect(count('entries')).toBe(0)
  expect(count('people')).toBe(0)
  expect(objects.size).toBe(0)
})

test('a picture larger than the limit is not read to its end', async () => {
  const { call, count, objects } = fixture()
  const add = () => call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'A sign', pictures: [{ url: 'https://img.example/huge.png' }] }] })
  pictures(() => new Response(png, { headers: { 'content-length': String(17 * 1024 * 1024) } }))
  expect(await add()).toMatchObject({ failed: true, value: expect.stringContaining('too large') })
  // With no length stated, the body is counted as it arrives and dropped once it passes the limit.
  let sent = 0, cancelled = false
  pictures(() => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { sent++; controller.enqueue(new Uint8Array(1024 * 1024)) },
    cancel() { cancelled = true },
  })))
  expect(await add()).toMatchObject({ failed: true, value: expect.stringContaining('too large') })
  expect(sent).toBeGreaterThan(16)
  expect(sent).toBeLessThan(20)
  expect(cancelled).toBe(true)
  expect(count('entries')).toBe(0)
  expect(objects.size).toBe(0)
})

test('one call fetches a bounded number of pictures and follows a few redirects', async () => {
  const { call, count } = fixture()
  const remote = (n: number) => Array.from({ length: n }, (_, index) => ({ url: `https://img.example/${index}.png` }))
  let asked = pictures()
  expect(await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'A', pictures: remote(6) }, { place: 'B', pictures: remote(FETCHES_MAX - 5) }] })).toMatchObject({ failed: true, value: expect.stringContaining(`up to ${FETCHES_MAX}`) })
  expect(asked).toHaveLength(FETCHES_MAX)
  expect(await call('add_sighting', { record: 1, pictures: remote(FETCHES_MAX + 1) })).toMatchObject({ failed: true })
  expect(count('entries')).toBe(0)

  const hop = (to: string) => new Response(null, { status: 302, headers: { location: to } })
  asked = pictures(url => url.endsWith('/a') ? hop('/b') : url.endsWith('/b') ? hop('https://cdn.example/c.png') : new Response(png))
  expect((await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'A', pictures: [{ url: 'https://img.example/a' }] }] })).failed).toBe(false)
  expect(asked).toEqual(['https://img.example/a', 'https://img.example/b', 'https://cdn.example/c.png'])
  asked = pictures(url => hop(`${url}x`))
  expect(await call('add_sighting', { record: 1, pictures: [{ url: 'https://img.example/loop' }] })).toMatchObject({ failed: true, value: expect.stringContaining('302') })
  expect(asked).toHaveLength(4)
  asked = pictures(() => hop('file:///etc/passwd'))
  expect((await call('add_sighting', { record: 1, pictures: [{ url: 'https://img.example/a' }] })).failed).toBe(true)
  expect(asked).toEqual(['https://img.example/a'])
  expect(count('sightings')).toBe(1)
})

test('a sighting is added to a record, with a picture the site already shows', async () => {
  const { call, db, raw, count, store } = fixture()
  const asked = pictures()
  await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'A sign', pictures: [{ url: 'https://img.example/sign.png' }] }] })
  await call('add_record', { ids: ['⿰山西'], sightings: [sighting] })
  const shown = (await call('get_record', { record: 1 })).value.sightings[0].pictures[0].url as string
  const added = await call('add_sighting', { record: 'R+0002', place: 'The same sign', pictures: [{ url: shown }], original_date: '1920' })
  expect(added).toEqual({ failed: false, value: { record: { id: 2, code: 'R+0002', url: `${ORIGIN}/entry/2` }, sighting: 3 } })
  expect(asked).toEqual(['https://img.example/sign.png'])
  expect(raw.query('SELECT sightings, first_year, cover_key IS NOT NULL AS covered FROM entries WHERE id = 2').get()).toEqual({ sightings: 2, first_year: '1920', covered: 1 })

  expect(await call('add_sighting', { record: 2, place: 'Nowhere' })).toMatchObject({ failed: true, value: expect.stringContaining('picture or a link') })
  expect(await call('add_sighting', { record: 9, url: 'https://example.test/x' })).toMatchObject({ failed: true, value: expect.stringContaining('does not exist') })
  expect(await call('add_sighting', { record: 2, url: 'https://example.test/x', pictures: [{ url: `${ORIGIN}/media/v2/${'0'.repeat(64)}.png` }] })).toMatchObject({ failed: true, value: expect.stringContaining('No picture') })
  // A picture of the site's own that would not fit the call is refused before it is read.
  const before = store.opened
  store.weighs = 40 * 1024 * 1024
  expect(await call('add_sighting', { record: 2, pictures: [{ url: shown }] })).toMatchObject({ failed: true, value: expect.stringContaining('too large') })
  expect(store.opened).toBe(before)
  store.weighs = null
  const moderator = (raw.query('SELECT id FROM people LIMIT 1').get() as { id: string }).id
  await mergeEntry(db, 2, 1, { actor: moderator, ip: null }, null)
  expect(await call('add_sighting', { record: 2, url: 'https://example.test/x' })).toMatchObject({ failed: true, value: expect.stringContaining('R+0001') })
  expect((await call('get_record', { record: 2 })).value).toEqual({ id: 2, code: 'R+0002', url: `${ORIGIN}/entry/2`, merged_into: { id: 1, code: 'R+0001', url: `${ORIGIN}/entry/1` } })
  expect(count('sightings')).toBe(3)
})

test('records are found by description, by word and by parts', async () => {
  const { call } = fixture()
  await call('add_record', { ids: ['⿰山東'], readings: [{ text: 'tōge' }], sightings: [sighting] })
  await call('add_record', { ids: ['⿱山東'], sightings: [{ ...sighting, title: 'Gazetteer' }] })
  await call('add_record', { ids: ['⿰氵西'], sightings: [sighting] })
  expect((await call('find_similar_records', { ids: '⿰山東' })).value).toEqual({
    same: [{ id: 1, code: 'R+0001', url: `${ORIGIN}/entry/1`, ids: '⿰山東' }],
    similar: [{ id: 2, code: 'R+0002', url: `${ORIGIN}/entry/2`, ids: '⿱山東' }],
  })
  expect((await call('find_similar_records', { ids: '⿰木木' })).value).toEqual({ same: [], similar: [] })
  expect((await call('find_similar_records', {})).failed).toBe(true)
  const ids = async (args: Record<string, unknown>) => ((await call('search_records', args)).value.records as { id: number }[]).map(found => found.id)
  expect(await ids({ query: 'gazetteer' })).toEqual([2])
  expect(await ids({ query: 'tōge' })).toEqual([1])
  expect(await ids({ query: '⿰氵西' })).toEqual([3])
  expect((await ids({})).sort()).toEqual([1, 2, 3])
  const first = (await call('search_records', { limit: 2 })).value
  expect(first.records).toHaveLength(2)
  expect((await call('search_records', { limit: 2, after: first.next })).value.records).toHaveLength(1)
  expect((await call('search_records', { query: 'a b c d e f' })).failed).toBe(true)
})

test('writes keep to the rate limit and to a pause, and reads go on', async () => {
  let allowed = 2
  const limited = fixture({ ADDS: { limit: async () => ({ success: allowed-- > 0 }) } })
  // Three sightings take three adds, and the window has two. Nothing is fetched for a call that is turned away.
  const asked = pictures()
  const pictured = { place: 'A sign', pictures: [{ url: 'https://img.example/sign.png' }] }
  expect(await limited.call('add_record', { ids: ['⿰山東'], sightings: [pictured, pictured, pictured] })).toMatchObject({ failed: true, value: expect.stringContaining('Wait a moment') })
  expect(asked).toEqual([])
  expect(limited.count('entries')).toBe(0)
  expect((await limited.call('add_record', { ids: ['⿰山東'], sightings: [sighting] })).failed).toBe(true)
  expect((await limited.call('search_records', {})).failed).toBe(false)

  const paused = fixture({ WRITES_PAUSED: '1' })
  expect(await paused.call('add_record', { ids: ['⿰山東'], sightings: [sighting] })).toMatchObject({ failed: true, value: expect.stringContaining('paused') })
  expect(await paused.call('add_sighting', { record: 1, url: 'https://example.test/x' })).toMatchObject({ failed: true, value: expect.stringContaining('paused') })
  expect((await paused.call('search_records', {})).failed).toBe(false)
})

test('a banned name cannot write through its connection', async () => {
  const { call, raw, count, connect } = fixture()
  const token = await connect()
  await call('add_record', { ids: ['⿰山東'], sightings: [sighting] }, token)
  raw.exec("UPDATE people SET banned_at = '2026-11-16T00:00:00.000Z'")
  const asked = pictures()
  expect(await call('add_record', { ids: ['⿰山西'], sightings: [{ place: 'A sign', pictures: [{ url: 'https://img.example/sign.png' }] }] }, token)).toMatchObject({ failed: true, value: expect.stringContaining('no longer save') })
  expect(asked).toEqual([])
  expect(count('entries')).toBe(1)
})

test('a record is edited field by field, against the revision read', async () => {
  const { call, raw } = fixture()
  pictures()
  await call('add_record', {
    ids: ['⿰身花'], meanings: [{ text: 'manners', evidence: [1] }], readings: [{ text: 'しつけ', doculect: 'ja', meanings: [1], evidence: [1] }],
    categories: ['kokuji'], sightings: [sighting],
  })
  const read = (await call('get_record', { record: 1 })).value
  expect(read.rev).toBe(1)
  const meaning = read.claims.find((claim: { kind: string }) => claim.kind === 'meaning')
  // Only the codes change; the readings, meanings and their evidence stay.
  expect(await call('edit_record', { record: 'R+0001', rev: 1, encodings: [{ charset: 'unicode', code: 'U+2C9E7' }], summary: 'Encoded as U+2C9E7.' })).toEqual({ failed: false, value: { record: { id: 1, code: 'R+0001', url: `${ORIGIN}/entry/1` }, rev: 2 } })
  const after = (await call('get_record', { record: 1 })).value
  expect(after.rev).toBe(2)
  expect(after.claims.filter((claim: { kind: string }) => claim.kind !== 'encoding')).toEqual(read.claims)
  expect(after.claims.find((claim: { kind: string }) => claim.kind === 'encoding')).toMatchObject({ value: 'U+2C9E7', data: { charset: 'unicode' } })
  expect(raw.query("SELECT summary FROM revisions WHERE kind = 'edit'").get()).toEqual({ summary: 'Encoded as U+2C9E7.' })
  // An edit against the revision before is refused and names the one to read.
  expect(await call('edit_record', { record: 1, rev: 1, description: 'Stale.' })).toMatchObject({ failed: true, value: expect.stringContaining('rev 2') })
  // A list replaces the record's: a row that repeats one keeps its evidence, a changed row continues one by its key.
  expect((await call('edit_record', { record: 1, rev: 2, meanings: [{ key: meaning.key, text: 'discipline' }, { text: 'upbringing' }], readings: [{ text: 'しつけ', doculect: 'ja' }] })).failed).toBe(false)
  const claims = (await call('get_record', { record: 1 })).value.claims as { key: string; kind: string; value: string; evidence: number[]; under?: string[] }[]
  const sightingId = read.sightings[0].id
  expect(claims.filter(claim => claim.kind === 'meaning').map(claim => [claim.key === meaning.key, claim.value, claim.evidence])).toEqual([[true, 'discipline', [sightingId]], [false, 'upbringing', []]])
  expect(claims.find(claim => claim.kind === 'reading')).toMatchObject({ value: 'しつけ', evidence: [sightingId], under: [meaning.key] })
  expect(claims.some(claim => claim.kind === 'tag' && claim.value === 'kokuji')).toBe(true)
  // Evidence names the record's own sightings by id.
  expect(await call('edit_record', { record: 1, rev: 3, meanings: [{ text: 'x', evidence: [999] }] })).toMatchObject({ failed: true, value: expect.stringContaining(`by id: ${sightingId}`) })
  expect(await call('edit_record', { record: 1, rev: 3, ids: [] })).toMatchObject({ failed: true })
  expect(await call('edit_record', { record: 9, rev: 1, description: 'x' })).toMatchObject({ failed: true, value: expect.stringContaining('does not exist') })
})

test('a sighting is edited field by field, keeping or replacing its pictures', async () => {
  const { call, objects } = fixture()
  const asked = pictures()
  await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', title: 'Book', report_date: '1816', quotes: [{ text: '⿰舟覽を解' }], vias: [{ url: 'https://x.example/1', author: '@poster' }], pictures: [{ url: 'https://img.example/page.png', marks: [[1, 1, 6, 6]] }] }] })
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  expect(read.rev).toBe(1)
  // Fields left out stay, the picture is untouched and nothing more is fetched.
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, note: 'Cursive; the right side is read as 覽.', author: 'Someone' })).toMatchObject({ failed: false, value: { sighting: read.id, rev: 2 } })
  let now = (await call('get_record', { record: 1 })).value.sightings[0]
  expect(now).toMatchObject({ rev: 2, title: 'Book', author: 'Someone', report_date: '1816', note: 'Cursive; the right side is read as 覽.', quotes: read.quotes, vias: read.vias, pictures: read.pictures })
  expect(asked).toHaveLength(1)
  // A held picture is kept by its address with new marks, and a new one is fetched after it.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 2, pictures: [{ url: read.pictures[0].url, marks: [[2, 2, 5, 5]] }, { url: 'https://img.example/other.png' }] })).failed).toBe(false)
  now = (await call('get_record', { record: 1 })).value.sightings[0]
  expect(now.pictures.map((picture: { marks: number[][] }) => picture.marks)).toEqual([[[2, 2, 5, 5]], []])
  expect(now.pictures[0].url).toBe(read.pictures[0].url)
  expect(asked).toHaveLength(2)
  expect(objects.size).toBe(1)
  // A cleared field is cleared, and a sighting left with no picture, link or place is refused.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 3, title: '' })).failed).toBe(false)
  expect((await call('get_record', { record: 1 })).value.sightings[0].title).toBeNull()
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 4, pictures: [], vias: [], place: '' })).toMatchObject({ failed: true, value: expect.stringContaining('picture or a link') })
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, note: 'Stale.' })).toMatchObject({ failed: true, value: expect.stringContaining('rev 4') })
  expect(await call('edit_sighting', { record: 1, sighting: 999, rev: 1 })).toMatchObject({ failed: true, value: expect.stringContaining(`Its sightings: ${read.id}`) })
})

test('an agent\'s edit keeps the pictures of the chain, which it cannot send', async () => {
  const { call, raw } = fixture()
  pictures()
  await call('add_record', { ids: ['⿰舟覽'], sightings: [{ ...sighting, vias: [{ author: '甲', container: '某討論羣', publisher: 'QQ', quote: '文' }] }] })
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  raw.run("INSERT INTO sighting_via_media VALUES (?, 0, 0, 'shot.png', 'image/png', 10, 10, 'shot-t.png')", [read.id])
  const held = async () => (await call('get_record', { record: 1 })).value.sightings[0].vias.map((via: { author: string; pictures: { url: string }[] }) => [via.author, via.pictures.map(picture => picture.url.split('/').pop())])
  expect(await held()).toEqual([['甲', ['shot.png']]])
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, note: 'Checked.' })).failed).toBe(false)
  expect(await held()).toEqual([['甲', ['shot.png']]])
  // A via given anew is the agent's text; the one with the picture stays beside it.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 2, vias: [{ author: '乙', publisher: 'QQ' }] })).failed).toBe(false)
  expect(await held()).toEqual([['乙', []], ['甲', ['shot.png']]])
})

test('an edit matches rows as the claims store them, and keeps the one of two equal pictures its marks name', async () => {
  const { call } = fixture()
  pictures()
  await call('add_record', {
    ids: ['⿰山東'], meanings: [{ text: 'café', evidence: [1] }], readings: [{ text: 'x', meanings: [1] }],
    sightings: [{ place: 'A page', pictures: [{ url: 'https://img.example/a.png', marks: [[1, 1, 4, 4]] }, { url: 'https://img.example/a.png', marks: [[2, 2, 5, 5]] }] }],
  })
  const read = (await call('get_record', { record: 1 })).value
  const meaning = read.claims.find((claim: { kind: string }) => claim.kind === 'meaning')
  expect((await call('edit_record', { record: 1, rev: 1, meanings: [{ text: 'café' }] })).failed).toBe(false)
  const claims = (await call('get_record', { record: 1 })).value.claims
  expect(claims.find((claim: { kind: string }) => claim.kind === 'meaning')).toMatchObject({ key: meaning.key, evidence: meaning.evidence })
  expect(claims.find((claim: { kind: string }) => claim.kind === 'reading').under).toEqual([meaning.key])
  const [, second] = read.sightings[0].pictures
  expect((await call('edit_sighting', { record: 1, sighting: read.sightings[0].id, rev: 1, pictures: [{ url: second.url, marks: second.marks }] })).failed).toBe(false)
  expect((await call('get_record', { record: 1 })).value.sightings[0].pictures.map((picture: { marks: number[][] }) => picture.marks)).toEqual([[[2, 2, 5, 5]]])
})

test('a creator named again without a key keeps its claim and evidence, whatever its spacing', async () => {
  const { call } = fixture()
  pictures()
  await call('add_record', { ids: ['⿻十〇'], creators: [{ name: 'Lu  Guanyi', evidence: [1] }], sightings: [sighting] })
  const before = (await call('get_record', { record: 1 })).value.claims.find((claim: { kind: string }) => claim.kind === 'creator')
  expect(before).toMatchObject({ value: 'Lu Guanyi', evidence: [1] })
  await call('edit_record', { record: 1, rev: 1, creators: ['Lu  Guanyi'], summary: 'Same maker.' })
  const after = (await call('get_record', { record: 1 })).value.claims.find((claim: { kind: string }) => claim.kind === 'creator')
  expect(after).toEqual(before)
})
