import { createHash } from 'node:crypto'
import { afterEach, expect, test } from 'bun:test'
import { LOCALE_COOKIE } from '$lib/i18n'
import { handle } from '../../hooks.server'
import { openTestDb } from '$lib/server/testdb'
import { mergeEntry, report } from '$lib/server/entries'
import { personOf } from '$lib/server/people'
import { MEDIA_MAX } from '$lib/limits'
import { PDF_SIDE } from '$lib/server/pdf'
import { imageObject, pdfOf } from '$lib/server/pdf.test'
import { FETCHES_MAX, PDF_PAGES_MAX } from './_tools.server'
import { GET, POST } from './+server'

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,10,0,0,0,10,8,6,0,0,0,0,0,0,0])
const ORIGIN = 'https://example.test'
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// Every picture address answers the same small PNG unless a test says otherwise.
function pictures(answer: (url: string) => Response = () => new Response(png, { headers: { 'content-type': 'image/png' } })) {
  const asked: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    asked.push(String(input))
    agents.push(new Headers(init?.headers).get('user-agent'))
    return answer(String(input))
  }) as typeof fetch
  return asked
}
const agents: (string | null)[] = []

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
  expect((await first.json() as any).result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'org.glyphatlas/rare-character-compendium' } })
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
  expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    'find_similar_records', 'search_records', 'get_record', 'list_tags', 'get_history',
    'add_record', 'add_sighting', 'edit_record', 'edit_sighting', 'link_sightings',
    'remove_sighting', 'merge_records', 'unmerge_record', 'add_comment', 'edit_source_alias', 'restore_revision',
  ])
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
    ids: ['⿰山東', '⿰山⿻日木'], description: 'On a shop sign.',
    meanings: [{ text: 'mountain pass', evidence: [2] }],
    readings: [{ text: 'tōge', doculect: 'ja', meanings: [1], evidence: [1, 2] }],
    creators: [{ name: '陸貫一', evidence: [2] }],
    encodings: [{ charset: 'unicode', code: 'U+5D20' }],
    related: [{ character: '峠', relationship: 'variant', difference: 'right side', readings: [1] }],
    categories: ['kokuji'], tags: ['han', 'signage'],
    sightings: [
      { ...sighting, pictures: [{ url: 'https://img.example/sign.png', marks: [[1, 1, 6, 6]] }] },
      { place: 'A dictionary', title: 'Book', author: 'Someone', report_date: '1936', page: '12', types: ['definition', 'reading'], contexts: ['running_text', 'heading'], vias: [{ url: 'https://example.test/post/1', author: '@poster', publisher: 'X', report_date: '2026-11-14', container: null, source_kind: null, quote: '書影 p. 3' }] },
    ],
  })
  expect(added).toEqual({ failed: false, value: { id: 1, code: 'R+0001', url: `${ORIGIN}/entry/1` } })
  expect(asked).toEqual(['https://img.example/sign.png'])
  // Some image hosts refuse a request without one.
  expect(agents.at(-1)).toBe(`GlyphAtlasRare/1.0 (+${ORIGIN}/mcp)`)
  expect(objects.size).toBe(1)
  expect(raw.query('SELECT ids, status, sightings, first_year FROM entries').get()).toEqual({ ids: '⿰山東', status: 'encoded', sightings: 2, first_year: '1936' })
  expect(raw.query('SELECT box, image_w FROM sighting_media').get()).toEqual({ box: '[[1,1,6,6]]', image_w: 10 })
  const claims = raw.query('SELECT key, kind, value, sightings, under FROM claims ORDER BY position').all() as { key: string; kind: string; value: string; sightings: string; under: string }[]
  expect(claims.map(claim => [claim.kind, claim.value])).toEqual([['ids', '⿰山東'], ['ids', '⿰山⿻日木'], ['reading', 'tōge'], ['meaning', 'mountain pass'], ['encoding', 'U+5D20'], ['relation', '峠'], ['tag', 'kokuji'], ['tag', 'han'], ['tag', 'signage'], ['creator', '陸貫一']])
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
    id: 1, status: 'encoded', description: 'On a shop sign.',
    sightings: [
      { id: 1, place: 'A shop sign', pictures: [{ url: expect.stringMatching(/^https:\/\/example\.test\/media\/v2\/[a-f0-9]{64}\.png$/), width: 10, height: 10, marks: [[1, 1, 6, 6]] }] },
      { id: 2, title: 'Book', contexts: ['running_text', 'heading'], types: ['definition', 'reading'], vias: [{ url: 'https://example.test/post/1', author: '@poster', quote: '書影 p. 3' }] },
    ],
  })
  expect(read.value.claims.find((claim: { kind: string }) => claim.kind === 'reading')).toMatchObject({ value: 'tōge', data: { doculect: 'ja' }, evidence: [1, 2] })
})

test('a form that cannot be described is added without ids', async () => {
  const { call, raw } = fixture()
  const added = await call('add_record', { tags: ['sawndip'], sightings: [sighting] })
  expect(added.failed).toBe(false)
  expect(raw.query('SELECT ids FROM entries').all()).toEqual([{ ids: null }])
  expect(raw.query("SELECT count(*) AS n FROM claims WHERE kind = 'ids'").get()).toEqual({ n: 0 })
  expect((await call('get_record', { record: 1 })).value.claims.map((c: { kind: string; value: string }) => [c.kind, c.value])).toEqual([['tag', 'sawndip']])
  expect(await call('add_record', { ids: [], sightings: [sighting] })).toMatchObject({ failed: true })
})

test('a new record is filed under its script tag, and under han when it names none', async () => {
  const { call } = fixture()
  const tagsOf = async (record: number) => (await call('get_record', { record })).value.claims.filter((c: { kind: string }) => c.kind === 'tag').map((c: { value: string }) => c.value)
  await call('add_record', { ids: ['⿰山東'], sightings: [sighting] })
  expect(await tagsOf(1)).toEqual(['han'])
  await call('add_record', { ids: ['⿰山西'], tags: ['#nom'], sightings: [sighting] })
  expect(await tagsOf(2)).toEqual(['nom'])
  await call('add_record', { ids: ['⿰山南'], tags: ['大陸'], sightings: [sighting] })
  expect(await tagsOf(3)).toEqual(['大陸', 'han'])
  expect(await call('add_record', { ids: ['⿰山北'], script: 'nom', sightings: [sighting] })).toMatchObject({ failed: true, value: expect.stringContaining('script is a tag now') })
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

test('a PDF address is kept as a picture of the page asked for', async () => {
  const { call, objects } = fixture()
  const pdf = pdfOf([[600, 300], [200, 400]])
  const asked = pictures(url => url.includes('.pdf') ? new Response(pdf, { headers: { 'content-type': 'application/pdf' } }) : new Response(png))
  const added = await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'A leaflet', pictures: [
    { url: 'https://img.example/leaflet.pdf', marks: [[100, 100, 200, 200]] },
    { url: 'https://img.example/leaflet.pdf', page: 2 },
  ] }] })
  expect(added.failed).toBe(false)
  // Each page is fetched for itself, and neither keeps the PDF.
  expect(asked).toHaveLength(2)
  expect([...objects.keys()].every(key => key.endsWith('.webp'))).toBe(true)
  expect((await call('get_record', { record: 1 })).value.sightings[0].pictures).toMatchObject([
    { url: expect.stringMatching(/\.webp$/), width: PDF_SIDE, height: PDF_SIDE / 2, marks: [[100, 100, 200, 200]] },
    { url: expect.stringMatching(/\.webp$/), width: PDF_SIDE / 2, height: PDF_SIDE },
  ])
  const refused = async (picture: Record<string, unknown>) => (await call('add_sighting', { record: 1, pictures: [picture] })).value as string
  expect(await refused({ url: 'https://img.example/leaflet.pdf', page: 3 })).toContain('Page 3')
  expect(await refused({ url: 'https://img.example/leaflet.pdf', page: 0 })).toContain('counted from 1')
  expect(await refused({ url: 'https://img.example/sign.png', page: 1 })).toContain('not one')
  // An address ending like a page mark is its own address, and a call draws a bounded number of pages.
  const both = await call('add_sighting', { record: 1, pictures: [{ url: 'https://img.example/leaflet.pdf#page=2' }, { url: 'https://img.example/leaflet.pdf', page: 2 }] })
  expect(both.failed).toBe(false)
  expect((await call('get_record', { record: 1 })).value.sightings[1].pictures).toMatchObject([{ width: PDF_SIDE }, { height: PDF_SIDE }])
  const many = Array.from({ length: PDF_PAGES_MAX + 1 }, (_, index) => ({ url: `https://img.example/${index}.pdf` }))
  expect((await call('add_sighting', { record: 1, pictures: many })).value).toContain(`up to ${PDF_PAGES_MAX} PDF pages`)
  expect(await refused({ url: 'https://img.example/leaflet.pdf', marks: [[0, 0, 2, 2]] })).toContain(`${PDF_SIDE} × ${PDF_SIDE / 2}`)
  // A range of pages is one picture a page.
  const ranged = await call('add_sighting', { record: 1, pictures: [{ url: 'https://img.example/leaflet.pdf', pages: '1-2' }] })
  expect(ranged.failed).toBe(false)
  expect((await call('get_record', { record: 1 })).value.sightings[2].pictures).toMatchObject([{ width: PDF_SIDE, height: PDF_SIDE / 2 }, { width: PDF_SIDE / 2, height: PDF_SIDE }])
  expect(await refused({ url: 'https://img.example/leaflet.pdf', pages: '2-3' })).toContain('Page 3')
  expect(await refused({ url: 'https://img.example/leaflet.pdf', pages: 'all' })).toContain('counted from 1')
  expect(await refused({ url: 'https://img.example/leaflet.pdf', pages: '1-2', page: 1 })).toContain('not both')
  expect(await refused({ url: 'https://img.example/leaflet.pdf', pages: '1-2', marks: [[100, 100, 200, 200]] })).toContain('one page')
  // A page scanned to a large JPEG 2000 image is refused before it is drawn.
  pictures(() => new Response(pdfOf([[600, 300]], [imageObject(3433, 2706, '/JPXDecode')]), { headers: { 'content-type': 'application/pdf' } }))
  expect(await refused({ url: 'https://img.example/scan.pdf' })).toContain('JPEG 2000 image of 3433 × 2706 pixels')
}, 60_000)

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
  let from = 0
  const remote = (n: number) => Array.from({ length: n }, () => ({ url: `https://img.example/${from++}.png` }))
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
  expect(await call('edit_record', { record: 1, rev: 1, creators: ['Lu  Guanyi'], summary: 'Same maker.' })).toMatchObject({ failed: false })
  const after = (await call('get_record', { record: 1 })).value.claims.find((claim: { kind: string }) => claim.kind === 'creator')
  expect(after).toEqual(before)
  // A compatibility spelling of the name is the same maker, written anew.
  expect(await call('edit_record', { record: 1, rev: 2, creators: ['Ｌu Guanyi'], summary: 'Spelling.' })).toMatchObject({ failed: false })
  const respelt = (await call('get_record', { record: 1 })).value.claims.find((claim: { kind: string }) => claim.kind === 'creator')
  expect(respelt).toEqual({ ...before, value: 'Ｌu Guanyi' })
})

// A second picture, taller than the first, so the two keep different keys.
const tall = Uint8Array.from(png, (byte, index) => index === 23 ? 12 : byte)
const wide = Uint8Array.from(png, (byte, index) => index === 19 ? 11 : byte)
const different = (url: string) => new Response(url.includes('tall') ? tall : url.includes('wide') ? wide : png, { headers: { 'content-type': 'image/png' } })
const post = { url: 'https://x.example/1', author: '@poster', container: 'Group', publisher: 'QQ' }
const viaPictures = async (call: Awaited<ReturnType<typeof fixture>>['call']) => (await call('get_record', { record: 1 })).value.sightings[0].vias.map((via: { author: string; pictures: { url: string; height: number }[] }) => [via.author, via.pictures.map(picture => picture.height)])

test('a via sends pictures with add_record and add_sighting, and they are listed by get_record', async () => {
  const { call, raw, objects, count } = fixture()
  const asked = pictures(different)
  expect((await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, pictures: ['https://img.example/shot.png', 'https://img.example/tall.png'] }] }] })).failed).toBe(false)
  expect(asked).toHaveLength(2)
  expect(objects.size).toBe(2)
  expect(await viaPictures(call)).toEqual([['@poster', [10, 12]]])
  expect(raw.query('SELECT via_position, position FROM sighting_via_media ORDER BY position').all()).toEqual([{ via_position: 0, position: 0 }, { via_position: 0, position: 1 }])
  expect((await call('add_sighting', { record: 1, place: 'Another', vias: [{ ...post, author: '@other', pictures: [{ url: 'https://img.example/tall.png' }] }] })).failed).toBe(false)
  expect(count('sighting_via_media')).toBe(3)
  expect(raw.query('SELECT count(*) AS n FROM sighting_media').get()).toEqual({ n: 0 })
})

test('a via with pictures and nothing else cites no evidence, and one with no citation is refused', async () => {
  const { call, count } = fixture()
  pictures()
  expect(await call('add_sighting', { record: 1, vias: [{ pictures: ['https://img.example/a.png'] }] })).toMatchObject({ failed: true })
  expect(await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, quote: 'x' }, { pictures: ['https://img.example/a.png'] }] }] })).toMatchObject({ failed: true, value: expect.stringContaining('Source 2') })
  expect(count('entries')).toBe(0)
})

test('the pictures of a sighting and of its vias share one fetch budget and one allowance', async () => {
  const { call, count } = fixture()
  const asked = pictures()
  const remote = (from: number, n: number) => Array.from({ length: n }, (_, index) => `https://img.example/${from + index}.png`)
  expect(await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A', pictures: remote(0, FETCHES_MAX - 1), vias: [{ ...post, pictures: remote(100, 2) }] }] })).toMatchObject({ failed: true, value: expect.stringContaining(`up to ${FETCHES_MAX}`) })
  expect(asked).toHaveLength(FETCHES_MAX)
  expect(count('entries')).toBe(0)
  const before = asked.length
  // More than the chain holds is refused before anything is fetched, across vias.
  expect(await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A', vias: [{ ...post, pictures: remote(0, MEDIA_MAX) }, { ...post, author: '@two', pictures: remote(50, 1) }] }] })).toMatchObject({ failed: true, value: expect.stringContaining(`${MEDIA_MAX}`) })
  expect(asked).toHaveLength(before)
})

test('edit_sighting gives a via exactly the pictures it states, and leaves the others as they are', async () => {
  const { call, objects } = fixture()
  const asked = pictures(different)
  await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, pictures: ['https://img.example/shot.png', 'https://img.example/tall.png'] }, { ...post, author: '@two', pictures: ['https://img.example/wide.png'] }] }] })
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  const second = read.vias[0].pictures[1], moved = read.vias[1].pictures[0]
  asked.length = 0
  // Naming one held picture keeps it without a fetch and lets the other go; the second via is untouched.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ ...post, pictures: [second.url] }, { ...post, author: '@two' }] })).failed).toBe(false)
  expect(asked).toHaveLength(0)
  expect(await viaPictures(call)).toEqual([['@poster', [12]], ['@two', [10]]])
  expect(objects.size).toBe(3)
  // A new address is fetched and joins the stated ones.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 2, vias: [{ ...post, pictures: [second.url, 'https://img.example/new.png'] }, { ...post, author: '@two' }] })).failed).toBe(false)
  expect(asked).toEqual(['https://img.example/new.png'])
  expect(await viaPictures(call)).toEqual([['@poster', [12, 10]], ['@two', [10]]])
  // An empty list takes them all away. A picture named by another via moves to it.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 3, vias: [{ ...post, pictures: [] }, { ...post, author: '@two' }] })).failed).toBe(false)
  expect(await viaPictures(call)).toEqual([['@poster', []], ['@two', [10]]])
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 4, vias: [{ ...post, author: '@three', pictures: [moved.url] }] })).failed).toBe(false)
  expect(await viaPictures(call)).toEqual([['@three', [10]]])
})

test('edit_sighting refuses too many pictures across the chain and pictures on a via with no source', async () => {
  const { call } = fixture()
  const asked = pictures(different)
  await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, pictures: ['https://img.example/shot.png'] }] }] })
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  const many = (n: number) => Array.from({ length: n }, (_, index) => `https://img.example/tall${index}.png`)
  asked.length = 0
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ ...post, pictures: many(MEDIA_MAX) }, { ...post, author: '@two', pictures: ['https://img.example/other.png'] }] })).toMatchObject({ failed: true, value: expect.stringContaining(`${MEDIA_MAX} pictures in all`) })
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ pictures: many(1) }] })).toMatchObject({ failed: true, value: expect.stringContaining('Source 1') })
  expect(asked).toHaveLength(0)
  expect(await viaPictures(call)).toEqual([['@poster', [10]]])
})

test('a call that states pictures on a via declares the chain\'s pictures', async () => {
  const { call } = fixture()
  pictures(different)
  const add = () => call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, author: 'a', pictures: ['https://img.example/shot.png', 'https://img.example/tall.png'] }] }] })
  await add()
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  const [x] = read.vias[0].pictures
  // Rewording the link and stating some of its pictures: the old link does not come back.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ ...post, author: 'a2', pictures: [x.url] }] })).failed).toBe(false)
  expect(await viaPictures(call)).toEqual([['a2', [10]]])
  // Stating an empty list lets the old ones go as well.
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 2, vias: [{ ...post, author: 'a3', pictures: [] }] })).failed).toBe(false)
  expect(await viaPictures(call)).toEqual([['a3', []]])
})

test('with no via stating pictures, a link the edit drops stays with its own', async () => {
  const { call } = fixture()
  pictures(different)
  await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A page', vias: [{ ...post, author: 'a', pictures: ['https://img.example/shot.png'] }] }] })
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  expect((await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ ...post, author: 'a2' }] })).failed).toBe(false)
  expect(await viaPictures(call)).toEqual([['a2', []], ['a', [10]]])
})

test('a picture stands once in a chain, and a refusal spends no fetch', async () => {
  const { call, raw } = fixture()
  const asked = pictures(different)
  const same = 'https://img.example/shot.png'
  expect(await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A', vias: [{ ...post, pictures: [same] }, { ...post, author: '@two', pictures: [same] }] }] })).toMatchObject({ failed: true, value: expect.stringContaining('one source') })
  expect(asked).toHaveLength(0)
  // A repeat within a via counts once, is fetched once and is stored once, in the revision too.
  expect((await call('add_record', { ids: ['⿰舟覽'], sightings: [{ place: 'A', vias: [{ ...post, pictures: [same, { url: same }, 'https://img.example/copy.png'] }] }] })).failed).toBe(false)
  expect(asked).toEqual([same, 'https://img.example/copy.png'])
  expect(await viaPictures(call)).toEqual([['@poster', [10]]])
  expect(raw.query('SELECT count(*) AS n FROM sighting_via_media').get()).toEqual({ n: 1 })
  expect(JSON.stringify(JSON.parse((raw.query("SELECT snapshot FROM revisions WHERE kind LIKE 'sighting%' ORDER BY rowid DESC").get() as { snapshot: string }).snapshot).vias[0].pictures)).not.toContain('},{')
  // An edit that would pass the chain's allowance is refused before it fetches.
  const read = (await call('get_record', { record: 1 })).value.sightings[0]
  asked.length = 0
  const held = read.vias[0].pictures[0].url
  const many = Array.from({ length: MEDIA_MAX }, (_, index) => `https://img.example/n${index}.png`)
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, pictures: ['https://img.example/s.png'], vias: [{ ...post, pictures: [held, ...many] }] })).toMatchObject({ failed: true, value: expect.stringContaining('in all') })
  expect(asked).toHaveLength(0)
  expect(await call('edit_sighting', { record: 1, sighting: read.id, rev: 1, vias: [{ ...post, pictures: [{ url: same, marks: [[1, 1, 6, 6]] }] }] })).toMatchObject({ failed: true, value: expect.stringContaining('no marks') })
})

test('every write is an agent\'s, named by the harness and model it says', async () => {
  const { call, connect, raw } = fixture()
  const actor = (record: number) => raw.query('SELECT p.name, p.agent, p.agent_model, p.merged_into FROM revisions r JOIN people p ON p.id = r.actor WHERE r.entry_id = ? ORDER BY r.id DESC LIMIT 1').get(record) as { name: string; agent: number; agent_model: string; merged_into: string | null }
  // A connection that says nothing is an unknown agent.
  const quiet = await connect()
  expect((await call('add_record', { ids: ['⿰山東'], sightings: [sighting] }, quiet)).failed).toBe(false)
  expect(actor(1)).toMatchObject({ name: 'Unknown', agent: 1, agent_model: '' })
  // What it says later names the same connection.
  expect((await call('add_record', { ids: ['⿰山西'], sightings: [sighting], agent: { harness: 'Claude Code', model: 'Fable 5.2' } }, quiet)).failed).toBe(false)
  expect(actor(1)).toMatchObject({ name: 'Claude Code', agent: 1, agent_model: 'Fable 5.2' })
  expect((raw.query('SELECT count(*) AS n FROM people').get() as { n: number }).n).toBe(1)
  // Another connection is another agent, and a harness alone is enough.
  const other = await connect()
  expect((await call('add_record', { ids: ['⿰山南'], sightings: [sighting], agent: { harness: 'Codex' } }, other)).failed).toBe(false)
  expect(actor(3)).toMatchObject({ name: 'Codex', agent: 1, agent_model: '' })
  expect((await call('add_sighting', { record: 1, ...sighting, place: 'Elsewhere', agent: { harness: 'x'.repeat(81) } }, other)).value).toContain('agent.harness')
})

test('cites, cited_by, link_sightings, and date-order warnings work across records', async () => {
  const { call } = fixture()
  const r1 = await call('add_record', {
    ids: ['⿰山東'],
    sightings: [{ place: 'Zihui Bu p. 5', title: '字彙補', report_date: '1666', url: 'https://example.test/zihui' }],
  })
  expect(r1.failed).toBe(false)
  const s1 = (await call('get_record', { record: r1.value.id })).value.sightings[0].id

  const r2 = await call('add_record', {
    ids: ['⿰山柬'],
    sightings: [{
      place: 'Kangxi p. 12', title: '康熙字典', report_date: '1716', url: 'https://example.test/kx',
      cites: [
        { kind: 'quotes', sighting: s1, title: '字彙補', quote: '《字彙補》音東' },
        { kind: 'quotes', title: '現代論文', report_date: '2024' },
      ],
      vias: [{ title: '古本', report_date: '1600' }],
    }],
  })
  expect(r2.failed).toBe(false)
  expect(r2.value.warnings).toHaveLength(2)

  // Cross-record cited_by appears on record 1.
  const got1 = (await call('get_record', { record: r1.value.id })).value
  expect(got1.sightings[0].cited_by).toHaveLength(1)
  expect(got1.sightings[0].cited_by[0]).toMatchObject({ kind: 'quotes', entry_id: r2.value.id, title: '康熙字典' })

  // link_sightings adds a derived edge (requiring note) and refuses direct 2-cycles.
  const s2 = (await call('get_record', { record: r2.value.id })).value.sightings[0].id
  expect((await call('link_sightings', { sighting: s2, kind: 'derived', source: { title: '龍龕手鑑' } })).failed).toBe(true)
  const linked = await call('link_sightings', { sighting: s2, kind: 'derived', source: { title: '龍龕手鑑', report_date: '997' }, note: 'same gloss', summary: 'link older gloss' })
  expect(linked.failed).toBe(false)
  expect(linked.value.rev).toBe(2)

  const twoCycle = await call('link_sightings', { sighting: s1, kind: 'quotes', cited_sighting: s2 })
  expect(twoCycle.failed).toBe(true)
})

test('GET /mcp redirects browsers to the localized setup page and answers 405 to MCP clients', async () => {
  const send = (method: 'GET' | 'HEAD', headers: Record<string, string> = {}, cookie?: string) => {
    const request = new Request(`${ORIGIN}/mcp`, { method, headers })
    const event = {
      request,
      url: new URL(request.url),
      route: { id: '/mcp' },
      params: {},
      locals: {},
      cookies: { get: (name: string) => name === LOCALE_COOKIE ? cookie : undefined },
      platform: undefined,
      getClientAddress: () => '127.0.0.1',
    }
    return handle({ event, resolve: (resolved: any) => GET(resolved) } as any)
  }

  const browser = await send('GET', { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en;q=0.8' })
  expect(browser.status).toBe(302)
  expect(browser.headers.get('location')).toBe('/ja/mcp')
  expect(browser.headers.get('cache-control')).toBe('private, no-store')
  expect(browser.headers.get('vary')).toBe('Accept, Accept-Language, Cookie')

  const head = await send('HEAD', { accept: 'text/html', 'accept-language': 'ja' })
  expect(head.status).toBe(302)
  expect(head.headers.get('location')).toBe('/ja/mcp')

  const preferred = await send('GET', { accept: 'text/html', 'accept-language': 'ja' }, 'zh-Hant')
  expect(preferred.status).toBe(302)
  expect(preferred.headers.get('location')).toBe('/zh-Hant/mcp')

  const invalidCookie = await send('GET', { accept: 'text/html', 'accept-language': 'ko' }, 'xx-Invalid')
  expect(invalidCookie.status).toBe(302)
  expect(invalidCookie.headers.get('location')).toBe('/ko/mcp')

  const zeroSse = await send('GET', { accept: 'text/html, text/event-stream;q=0', 'accept-language': 'en' })
  expect(zeroSse.status).toBe(302)
  expect(zeroSse.headers.get('location')).toBe('/en/mcp')

  const nonHtml: Record<string, string>[] = [
    {},
    { accept: 'text/event-stream' },
    { accept: 'text/html, text/event-stream' },
    { accept: 'text/event-stream;q=0.5, text/html' },
    { accept: 'text/html, text/event-stream;q=0.5' },
    { accept: 'application/json' },
    { accept: '*/*' },
    { accept: 'text/html;q=0' },
    { accept: 'text/html;q=2' },
    { accept: 'text/html;q=0x1' },
  ]
  for (const headers of nonHtml) {
    const response = await send('GET', headers)
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
    expect(response.headers.get('vary')).toBe('Accept')
  }
})

test('list_tags, add_comment, and edit_source_alias work via MCP', async () => {
  const { call, raw } = fixture()
  const tags = await call('list_tags', {})
  expect(tags.failed).toBe(false)
  expect(tags.value.tags.some((tag: { name: string }) => tag.name === 'kokuji')).toBe(true)

  await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'p. 1', title: 'Kangxi Dictionary', url: 'https://example.test/1' }] })
  const initial = (await call('get_record', { record: 1 })).value
  expect(initial.sightings[0].source_id).toBeGreaterThan(0)
  expect(initial.comments).toEqual([])

  const commented = await call('add_comment', { record: 1, sighting: initial.sightings[0].id, body: 'Matches block print.', agent: { harness: 'Test' } })
  expect(commented.failed).toBe(false)
  expect(commented.value.comment).toBeGreaterThan(0)
  expect(await call('add_comment', { record: 1, sighting: 999, body: 'bad', agent: { harness: 'Test' } })).toMatchObject({ failed: true })
  expect(await call('add_comment', { record: 1, body: '   ', agent: { harness: 'Test' } })).toMatchObject({ failed: true })

  const afterComment = (await call('get_record', { record: 1 })).value
  expect(afterComment.comments).toHaveLength(1)
  expect(afterComment.comments[0]).toMatchObject({ sighting: initial.sightings[0].id, body: 'Matches block print.' })

  const sourceId = initial.sightings[0].source_id
  expect(await call('edit_source_alias', { source: sourceId, alias: 'KXZD', action: 'add', agent: { harness: 'Test' } })).toEqual({
    failed: false,
    value: { source: sourceId, alias: 'KXZD', action: 'add' },
  })
  expect(raw.query('SELECT spelling FROM source_aliases WHERE source_id = ?').all(sourceId)).toEqual([{ spelling: 'KXZD' }])
  expect((await call('edit_source_alias', { source: sourceId, alias: 'KXZD', action: 'remove', agent: { harness: 'Test' } })).failed).toBe(false)
  expect(raw.query('SELECT spelling FROM source_aliases WHERE source_id = ?').all(sourceId)).toEqual([])
})

test('remove_sighting, merge_records, unmerge_record, get_history, and restore_revision work via MCP', async () => {
  const { call } = fixture()
  await call('add_record', { ids: ['⿰山東'], description: 'First', sightings: [{ place: 'p. 1', url: 'https://example.test/1' }] })
  const added = await call('add_sighting', { record: 1, place: 'p. 2', url: 'https://example.test/2' })
  const secondId = added.value.sighting as number

  // Remove the second sighting, refuse removing the last remaining one, then put it back.
  expect(await call('remove_sighting', { record: 1, sighting: secondId, rev: 1, summary: 'Duplicate scan', agent: { harness: 'Test' } })).toMatchObject({
    failed: false,
    value: { sighting: secondId, removed: true },
  })
  const firstId = (await call('get_record', { record: 1 })).value.sightings[0].id as number
  expect(await call('remove_sighting', { record: 1, sighting: firstId, rev: 1, agent: { harness: 'Test' } })).toMatchObject({
    failed: true,
    value: expect.stringContaining('only remaining'),
  })

  const hist = (await call('get_history', { record: 1 })).value
  expect(hist.removed).toHaveLength(1)
  expect(hist.removed[0].id).toBe(secondId)
  expect(await call('restore_revision', { record: 1, sighting: secondId, put_back: true, agent: { harness: 'Test' } })).toMatchObject({
    failed: false,
    value: { sighting: secondId, restored: true },
  })
  expect((await call('get_record', { record: 1 })).value.sightings).toHaveLength(2)

  // Edit record + sighting, then restore both from history.
  await call('edit_record', { record: 1, rev: 1, description: 'Second', agent: { harness: 'Test' } })
  await call('edit_sighting', { record: 1, sighting: firstId, rev: 1, place: 'p. 1 corrected', agent: { harness: 'Test' } })
  const histAfter = (await call('get_history', { record: 1 })).value
  const createRow = histAfter.rows.find((row: { sighting: number | null; rev: number }) => row.sighting === null && row.rev === 1)
  const sightingRow = histAfter.rows.find((row: { sighting: number | null; rev: number }) => row.sighting === firstId && row.rev === 1)
  expect(createRow.fields?.description).toBe('First')
  expect(sightingRow.sighting_fields?.place).toBe('p. 1')

  expect(await call('restore_revision', { record: 1, revision: String(createRow.id), rev: 2, agent: { harness: 'Test' } })).toMatchObject({ failed: false, value: { rev: 3 } })
  expect((await call('get_record', { record: 1 })).value.description).toBe('First')
  expect(await call('restore_revision', { record: 1, sighting: firstId, revision: sightingRow.id, rev: 2, agent: { harness: 'Test' } })).toMatchObject({ failed: false, value: { sighting: firstId, rev: 3 } })
  expect((await call('get_record', { record: 1 })).value.sightings.find((s: { id: number }) => s.id === firstId).place).toBe('p. 1')

  // Merge two records (always higher into lower) and undo the merge.
  await call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'p. 3', url: 'https://example.test/3' }] })
  expect(await call('merge_records', { record: 1, duplicate_of: 2, summary: 'Same glyph', agent: { harness: 'Test' } })).toMatchObject({
    failed: false,
    value: { merged: { id: 2 }, into: { id: 1 } },
  })
  expect((await call('get_record', { record: 2 })).value.merged_into.id).toBe(1)
  expect((await call('get_history', { record: 1 })).value.duplicates).toHaveLength(1)
  expect(await call('unmerge_record', { record: 2, agent: { harness: 'Test' } })).toMatchObject({
    failed: false,
    value: { record: { id: 2 }, from: { id: 1 }, unmerged: true },
  })
  expect((await call('get_record', { record: 2 })).value.merged_into).toBeUndefined()
  expect(await call('unmerge_record', { record: 2, agent: { harness: 'Test' } })).toMatchObject({ failed: true })
})

test('moderator MCP tools are advertised and callable only by unbanned moderators, even when writes are paused', async () => {
  const { db, raw, send, call } = fixture({ WRITES_PAUSED: '1' })
  const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
  const at = new Date().toISOString()
  raw.run("INSERT INTO people(id, name, role, created_at) VALUES('mod1', 'ModBot', 'moderator', ?)", [at])
  raw.run("INSERT INTO people(id, name, role, created_at) VALUES('mem1', 'MemberBot', 'member', ?)", [at])
  raw.run("INSERT INTO agent_clients(id, name, redirect_uris, created_at, used_at) VALUES('c1', 'Bot', '[]', ?, ?)", [at, at])
  const modToken = 'a'.repeat(64)
  const memToken = 'b'.repeat(64)
  raw.run('INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(?, ?, ?, ?)', [tokenHash(modToken), 'c1', 'mod1', at])
  raw.run('INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(?, ?, ?, ?)', [tokenHash(memToken), 'c1', 'mem1', at])

  const modAuth = { authorization: `Bearer ${modToken}` }
  const memAuth = { authorization: `Bearer ${memToken}` }

  // Anonymous and regular members do not see moderator tools and are refused when calling them.
  const anonTools = (await (await send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json() as any).result.tools.map((t: { name: string }) => t.name)
  const memTools = (await (await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, memAuth)).json() as any).result.tools.map((t: { name: string }) => t.name)
  const modTools = (await (await send({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, modAuth)).json() as any).result.tools.map((t: { name: string }) => t.name)
  for (const name of ['set_hidden', 'list_reports', 'resolve_report', 'set_comment_hidden', 'redact_revision']) {
    expect(anonTools).not.toContain(name)
    expect(memTools).not.toContain(name)
    expect(modTools).toContain(name)
  }

  const callAs = async (name: string, args: Record<string, unknown>, headers: Record<string, string>) => {
    const body = await (await send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers)).json() as any
    const text = body.result.content[0].text
    return { failed: Boolean(body.result.isError), value: body.result.isError ? text : JSON.parse(text) }
  }

  expect(await callAs('list_reports', {}, memAuth)).toMatchObject({ failed: true, value: expect.stringContaining('moderator') })
  expect(await callAs('set_hidden', { record: 1, hidden: true, agent: { harness: 'Test' } }, memAuth)).toMatchObject({ failed: true, value: expect.stringContaining('moderator') })

  // Full end-to-end moderation lifecycle on an unpaused database.
  const unpaused = fixture()
  unpaused.raw.run("INSERT INTO people(id, name, role, created_at) VALUES('mod1', 'ModBot', 'moderator', ?)", [at])
  unpaused.raw.run("INSERT INTO agent_clients(id, name, redirect_uris, created_at, used_at) VALUES('c1', 'Bot', '[]', ?, ?)", [at, at])
  unpaused.raw.run('INSERT INTO agent_tokens(token_hash, client, person, created_at) VALUES(?, ?, ?, ?)', [tokenHash(modToken), 'c1', 'mod1', at])
  const callMod = async (name: string, args: Record<string, unknown>) => {
    const body = await (await unpaused.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, modAuth)).json() as any
    const text = body.result.content[0].text
    return { failed: Boolean(body.result.isError), value: body.result.isError ? text : JSON.parse(text) }
  }

  await unpaused.call('add_record', { ids: ['⿰山東'], description: 'Secret PII', sightings: [{ place: 'p. 1', url: 'https://example.test/1' }] })
  await unpaused.call('edit_record', { record: 1, rev: 1, description: 'Clean', agent: { harness: 'Test' } })
  const sightingId = (await unpaused.call('get_record', { record: 1 })).value.sightings[0].id as number
  const commentId = (await unpaused.call('add_comment', { record: 1, body: 'Spam link', agent: { harness: 'Test' } })).value.comment as number
  await report(unpaused.db, { entry: 1, sighting: sightingId }, 'Spam sighting', 'mod1')

  // List & resolve reports.
  const listed = await callMod('list_reports', {})
  expect(listed.failed).toBe(false)
  expect(listed.value.reports).toHaveLength(1)
  const reportId = listed.value.reports[0].id as number
  expect(await callMod('resolve_report', { report: reportId, agent: { harness: 'Mod' } })).toEqual({ failed: false, value: { report: reportId, resolved: true } })
  expect((await callMod('list_reports', {})).value.reports).toEqual([])

  // Hide comment: hidden from public and default moderator get_record; visible only with include_hidden: true.
  expect(await callMod('set_comment_hidden', { record: 1, comment: commentId, hidden: true, agent: { harness: 'Mod' } })).toMatchObject({ failed: false, value: { comment: commentId, hidden: true } })
  expect((await unpaused.call('get_record', { record: 1, include_hidden: true })).value.comments).toEqual([])
  expect((await callMod('get_record', { record: 1 })).value.comments).toEqual([])
  expect((await callMod('get_record', { record: 1, include_hidden: true })).value.comments).toMatchObject([{ id: commentId, hidden: true }])

  // Hide sighting & record: hidden by default even for moderators; visible when include_hidden: true.
  expect(await callMod('set_hidden', { record: 1, sighting: sightingId, hidden: true, summary: 'Bad scan', agent: { harness: 'Mod' } })).toMatchObject({ failed: false, value: { sighting: sightingId, hidden: true } })
  expect((await unpaused.call('get_record', { record: 1, include_hidden: true })).value.sightings).toEqual([])
  expect((await callMod('get_record', { record: 1 })).value.sightings).toEqual([])
  expect((await callMod('get_record', { record: 1, include_hidden: true })).value.sightings).toMatchObject([{ id: sightingId, hidden: true }])
  const hiddenHist = (await callMod('get_history', { record: 1, include_hidden: true })).value.rows as { sighting: number | null; hidden?: boolean }[]
  expect(hiddenHist.some(row => row.sighting === sightingId && row.hidden === true)).toBe(true)

  expect(await callMod('set_hidden', { record: 1, hidden: true, summary: 'Spam', agent: { harness: 'Mod' } })).toMatchObject({ failed: false, value: { hidden: true } })
  expect((await unpaused.call('get_record', { record: 1, include_hidden: true })).failed).toBe(true)
  expect((await callMod('get_record', { record: 1 })).failed).toBe(true)
  expect((await callMod('get_record', { record: 1, include_hidden: true })).value.hidden).toBe(true)
  expect(await callMod('set_hidden', { record: 1, hidden: false, agent: { harness: 'Mod' } })).toMatchObject({ failed: false, value: { hidden: false } })

  // Redact past revision (rev 1) succeeds; redacting current revision (rev 2) is refused.
  const hist = (await callMod('get_history', { record: 1 })).value.rows as { id: number; sighting: number | null; rev: number }[]
  const rev1 = hist.find(r => r.sighting === null && r.rev === 1)!
  const rev2 = hist.find(r => r.sighting === null && r.rev === 2)!
  expect(await callMod('redact_revision', { record: 1, revision: rev1.id, summary: 'Remove PII', agent: { harness: 'Mod' } })).toMatchObject({ failed: false, value: { revision: rev1.id, redacted: true } })
  expect(await callMod('redact_revision', { record: 1, revision: rev2.id, agent: { harness: 'Mod' } })).toMatchObject({ failed: true })

  // Merged records are refused by set_hidden so duplicates stay reachable for unmerge.
  await unpaused.call('add_record', { ids: ['⿰山東'], sightings: [{ place: 'p. 2', url: 'https://example.test/2' }] })
  await unpaused.call('merge_records', { record: 1, duplicate_of: 2, agent: { harness: 'Test' } })
  expect(await callMod('set_hidden', { record: 2, hidden: true, agent: { harness: 'Mod' } })).toMatchObject({ failed: true, value: expect.stringContaining('merged') })

  // Moderator tools still work under WRITES_PAUSED=1.
  raw.run("INSERT INTO entries(id, rev, created_by, created_at, updated_at) VALUES(1, 1, 'mod1', ?, ?)", [at, at])
  await report(db, { entry: 1, sighting: null }, 'Paused test', 'mod1')
  expect((await callAs('resolve_report', { report: 1, agent: { harness: 'Mod' } }, modAuth)).failed).toBe(false)

  // A banned moderator loses moderator tool visibility and access.
  raw.run("UPDATE people SET banned_at = ? WHERE id = 'mod1'", [at])
  const bannedTools = (await (await send({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, modAuth)).json() as any).result.tools.map((t: { name: string }) => t.name)
  expect(bannedTools).not.toContain('set_hidden')
  expect(await callAs('list_reports', {}, modAuth)).toMatchObject({ failed: true })
  expect(await callAs('set_hidden', { record: 1, hidden: true, agent: { harness: 'Mod' } }, modAuth)).toMatchObject({ failed: true })
})
