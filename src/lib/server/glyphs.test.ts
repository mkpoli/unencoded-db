import { afterEach, expect, setSystemTime, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { composerDrawing, composerUrl, composerVersion, glyphStyleOf } from '$lib/composer'
import { MISSING_MS } from './glyph-cache'
import { composerReader, drawGlyph, glyphName, glyphPaths, sourceKey, tileGlyphs } from './glyphs'
import { hashHex } from './image'

test('a page reads cached drawings by the cleaned description', async () => {
  const key = `glyphs/${composerDrawing('sans')}/${await hashHex('⿰魚羊')}.txt`
  const bucket = {
    get: async (name: string) => name === key ? { text: async () => 'M0 0' } : null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  expect(await glyphPaths(bucket, [{ ids: ' ⿰ 魚 羊 ' }, { ids: null }, { ids: '⿰木木' }])).toEqual({ '⿰魚羊': 'M0 0' })
})

test('a description with a layout is another drawing than the description alone', async () => {
  const layout = '{"0":[1,0,0,1,40,0]}'
  const plain = { ids: '⿰魚羊' }, moved = { ids: '⿰魚羊', layout }
  expect(glyphName(moved)).toBe(`⿰魚羊\n${layout}`)
  const key = `glyphs/${composerDrawing('sans', true)}/${await hashHex(glyphName(moved))}.txt`
  const bucket = {
    get: async (name: string) => name === key ? { text: async () => '<g/>' } : null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  expect(await glyphPaths(bucket, [plain, moved])).toEqual({ [glyphName(moved)]: '<g/>' })
})

test('a layout that is not one of the description draws the description alone', () => {
  expect(glyphName({ ids: '⿰魚羊', layout: '{"2":[1,0,0,1,40,0]}' })).toBe('⿰魚羊')
  expect(glyphName({ ids: '⿰魚羊', layout: 'no' })).toBe('⿰魚羊')
})

test('a page without a bucket shows no drawings', async () => {
  expect(await glyphPaths(undefined, [{ ids: '⿰魚羊' }])).toEqual({})
})

const bopomofo = async () => {
  const outlines = await readFile(new URL('../../../node_modules/han-compose/data/sources/bopomofo/outlines.json.gz', import.meta.url))
  const kept: string[] = []
  const bucket = { get: async () => null, put: async (key: string) => { kept.push(key) } } as unknown as Pick<R2Bucket, 'get' | 'put'>
  return { bucket, kept, context: { assets: { fetch: async () => new Response(outlines) }, origin: 'https://example.test' } }
}

test('a bundled Bopomofo part draws through the build\'s asset binding', async () => {
  const { bucket, context } = await bopomofo()
  expect(await drawGlyph(bucket, { ids: 'ㄍ' }, context)).toMatch(/^M/)
})

test('overlapping cold drawings read bundled assets through their own request', async () => {
  const { bucket, context } = await bopomofo()
  const reads = [0, 0]
  const paths = await Promise.all(['ㄍ', 'ㄎ'].map((ids, i) => drawGlyph(bucket, { ids }, {
    ...context, assets: { fetch: async () => {
      reads[i]++
      return context.assets.fetch()
    } }
  })))
  expect(paths.every(path => path?.startsWith('M'))).toBe(true)
  expect(reads.every(count => count > 0)).toBe(true)
})

test('a description with a layout is drawn part by part as markup, and kept under its own name', async () => {
  const { bucket, kept, context } = await bopomofo()
  const moved = { ids: '⿰ㄍㄎ', layout: '{"0":[1,0,0,1,-40,12]}' }
  const plain = await drawGlyph(bucket, { ids: moved.ids }, context)
  const drawn = await drawGlyph(bucket, moved, context)
  expect(plain).toMatch(/^M/)
  expect(drawn).toMatch(/^<defs>.*<path d="M/)
  expect(kept).toEqual([moved.ids, glyphName(moved)].map(name => `glyphs/${composerDrawing('sans', name.includes('\n'))}/${new Bun.CryptoHasher('sha256').update(name).digest('hex')}.txt`))
})

test('each style keeps its drawings in its own folder', async () => {
  const key = (style: 'sans' | 'serif') => `glyphs/${composerDrawing(style)}/${new Bun.CryptoHasher('sha256').update('⿰魚羊').digest('hex')}.txt`
  const bucket = {
    get: async (name: string) => name === key('serif') ? { text: async () => 'M1 1' } : null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({})
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }], 'serif')).toEqual({ '⿰魚羊': 'M1 1' })
  const { bucket: drawing, kept, context } = await bopomofo()
  expect(await drawGlyph(drawing, { ids: 'ㄍ' }, { ...context, style: 'serif' })).toMatch(/^M/)
  expect(kept).toEqual([`glyphs/${composerDrawing('serif')}/${new Bun.CryptoHasher('sha256').update('ㄍ').digest('hex')}.txt`])
})

test('a style that is not one draws in the default', () => {
  expect(glyphStyleOf('serif')).toBe('serif')
  expect(glyphStyleOf('comic')).toBe('sans')
  expect(glyphStyleOf(undefined)).toBe('sans')
})

test('a description bundled outlines draw alone never shares a source with one that needs the export', () => {
  // Both call for the palette, so their traits match; only the second has a part the export holds.
  expect(sourceKey('⿰㇐㇑', {})).not.toBe(sourceKey('⿰木㇐', {}))
  expect(sourceKey('⿱木㇐', {})).toBe(sourceKey('⿰木㇐', {}))
  expect(sourceKey('⿰木㇐', { style: 'serif' })).not.toBe(sourceKey('⿰木㇐', {}))
})

test('the server lists every bundled file the composer reads', async () => {
  const { dataUrls } = await import('han-compose')
  const { composerData } = await import('$lib/composer-data')
  // The Unicode shards are listed by the build; the rest by name.
  expect(Object.keys(dataUrls).filter(name => !name.startsWith('unicode/') && !(name in composerData))).toEqual([])
})

test('simultaneous requests for the same glyph own their R2 reads', async () => {
  // Neither read answers until both are under way: a request waiting on the other's read would never start its own.
  let reads = 0, started!: () => void
  const both = new Promise<void>(resolve => { started = resolve })
  const bucket = {
    get: async () => {
      const value = 'M' + ++reads
      if (reads === 2) started()
      await both
      return { text: async () => value }
    }
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  const paths = await Promise.all([drawGlyph(bucket, { ids: '木' }), drawGlyph(bucket, { ids: '木' })])
  expect(new Set(paths)).toEqual(new Set(['M1', 'M2']))
})

type Stored = string | Uint8Array
type Kept = Pick<R2Bucket, 'get' | 'put'>
const realFetch = globalThis.fetch
afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches
  globalThis.fetch = realFetch
  setSystemTime()
})

// A bucket that counts what is asked of it.
function bucketOf(objects: Record<string, Stored> = {}) {
  const gets: string[] = [], puts: string[] = []
  const bucket = {
    get: async (key: string) => {
      gets.push(key)
      const value = objects[key]
      if (value === undefined) return null
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      return { text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.slice().buffer }
    },
    put: async (key: string, value: Stored) => {
      puts.push(key)
      objects[key] = value
    },
  } as unknown as Kept
  return { bucket, objects, gets, puts }
}

// The edge every isolate of a place shares, as `caches.default`.
function edgeOf() {
  const held = new Map<string, Response>(), matches: string[] = [], puts: string[] = []
  ;(globalThis as { caches?: unknown }).caches = { default: {
    match: async (address: string) => {
      matches.push(address)
      return held.get(address)?.clone()
    },
    put: async (address: string, response: Response) => {
      puts.push(address)
      held.set(address, response)
    },
  } }
  return { held, matches, puts }
}

const drawingKey = async (name: string, style: 'sans' | 'serif' = 'sans') => `glyphs/${composerDrawing(style, name.includes('\n'))}/${await hashHex(name)}.txt`
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test('a drawing read once is not read from the bucket again', async () => {
  const { bucket, gets } = bucketOf({ [await drawingKey('⿰魚羊')]: 'M0 0' })
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }, { ids: ' ⿰ 魚 羊 ' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(await drawGlyph(bucket, { ids: '⿰魚羊' })).toBe('M0 0')
  expect(gets).toEqual([await drawingKey('⿰魚羊')])
})

test('a glyph not drawn yet is asked for every time, and shows as soon as it is drawn', async () => {
  const edge = edgeOf()
  const { bucket, objects, gets } = bucketOf()
  const key = await drawingKey('⿰魚羊')
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({})
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({})
  expect(gets).toEqual([key, key])
  await settle()
  expect(edge.puts).toEqual([])
  objects[key] = 'M0 0'
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(gets).toEqual([key, key, key])
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(gets).toHaveLength(3)
  // Another isolate, which never saw the earlier answers, reads the bucket for itself too.
  const later = bucketOf()
  edge.held.clear()
  expect(await glyphPaths(later.bucket, [{ ids: '⿰魚羊' }])).toEqual({})
  expect(later.gets).toEqual([key])
})

test('an isolate that has not read a drawing takes it from the edge', async () => {
  const edge = edgeOf()
  const key = await drawingKey('⿰魚羊')
  const first = bucketOf({ [key]: 'M0 0' })
  expect(await glyphPaths(first.bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  await settle()
  expect(edge.matches).toEqual([`https://rare.glyphatlas.org/r2-kept/${key}`])
  expect(edge.puts).toEqual(edge.matches)
  const copy = edge.held.get(edge.puts[0])!
  expect(copy.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  expect(await copy.clone().text()).toBe('M0 0')
  // Each bucket stands for an isolate: a new one has nothing of its own.
  const second = bucketOf()
  expect(await glyphPaths(second.bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(second.gets).toEqual([])
  expect(edge.matches).toHaveLength(2)
  // What the edge answered stays in the isolate, so the edge is not asked again either.
  expect(await glyphPaths(second.bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(edge.matches).toHaveLength(2)
  expect(edge.puts).toHaveLength(1)
})

test('a drawing just made is on the next page without a read', async () => {
  const edge = edgeOf()
  const { bucket, context } = await bopomofo()
  const drawn = await drawGlyph(bucket, { ids: 'ㄍ' }, context)
  expect(drawn).toMatch(/^M/)
  expect(await glyphPaths(bucket, [{ ids: 'ㄍ' }])).toEqual({ 'ㄍ': drawn! })
  await settle()
  expect(edge.puts).toEqual([`https://rare.glyphatlas.org/r2-kept/${await drawingKey('ㄍ')}`])
})

test('a drawing that could not be stored is not kept', async () => {
  const edge = edgeOf()
  const { context } = await bopomofo()
  const bucket = { get: async () => null, put: async () => { throw new Error('R2 is away') } } as unknown as Kept
  await expect(drawGlyph(bucket, { ids: 'ㄍ' }, context)).rejects.toThrow('R2 is away')
  expect(await glyphPaths(bucket, [{ ids: 'ㄍ' }])).toEqual({})
  expect(edge.puts).toEqual([])
})

test('the copy for the edge is handed to the request, and the answer does not wait for it', async () => {
  const puts: string[] = []
  ;(globalThis as { caches?: unknown }).caches = { default: {
    match: async () => undefined,
    put: (address: string) => {
      puts.push(address)
      return new Promise(() => {})
    },
  } }
  const key = await drawingKey('⿰魚羊')
  const handed: Promise<unknown>[] = []
  const withContext = bucketOf({ [key]: 'M0 0' })
  expect(await glyphPaths(withContext.bucket, [{ ids: '⿰魚羊' }], 'sans', work => { handed.push(work) })).toEqual({ '⿰魚羊': 'M0 0' })
  expect(handed).toHaveLength(1)
  expect(handed[0]).toBeInstanceOf(Promise)
  // With no request to hand it to, the copy is started and left.
  const without = bucketOf({ [key]: 'M0 0' })
  expect(await glyphPaths(without.bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(puts).toHaveLength(2)
  expect(handed).toHaveLength(1)
})

test('a page hands its edge copies to the request that asked', async () => {
  edgeOf()
  const { bucket } = bucketOf({ [await drawingKey('⿰魚羊')]: 'M0 0' })
  const waited: Promise<unknown>[] = []
  const platform = { env: { MEDIA: bucket }, ctx: { waitUntil(work: Promise<unknown>) { expect(this).toBe(platform.ctx); waited.push(work) } } } as unknown as App.Platform
  expect(await tileGlyphs(platform, 'https://example.test', [{ id: 7, ids: '⿰魚羊' }])).toEqual({ 7: 'M0 0' })
  expect(waited).toHaveLength(1)
  await Promise.all(waited)
})

test('an edge that fails leaves the bucket answering', async () => {
  const key = await drawingKey('⿰魚羊')
  const edges = [
    { match: async () => { throw new Error('no edge') }, put: async () => { throw new Error('no edge') } },
    { match: () => { throw new Error('no edge') }, put: () => { throw new Error('no edge') } },
    { match: async () => new Response('gone', { status: 500 }), put: async () => {} },
    { match: async () => new Response(''), put: async () => {} },
  ]
  for (const edge of edges) {
    ;(globalThis as { caches?: unknown }).caches = { default: edge }
    const { bucket, gets } = bucketOf({ [key]: 'M0 0' })
    expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }], 'sans', () => { throw new Error('the request is over') })).toEqual({ '⿰魚羊': 'M0 0' })
    expect(gets).toEqual([key])
    await settle()
  }
})

test('a request still waiting on a read does not hold up the next', async () => {
  const key = await drawingKey('⿰魚羊')
  // The first read of the bucket never answers; the request after it reads for itself.
  let reads = 0
  const bucket = {
    get: (asked: string) => ++reads === 1 ? new Promise(() => {}) : Promise.resolve(asked === key ? { text: async () => 'M0 0' } : null),
    put: async () => {},
  } as unknown as Kept
  let first: unknown = 'waiting'
  void glyphPaths(bucket, [{ ids: '⿰魚羊' }]).then(paths => { first = paths })
  await settle()
  expect(await glyphPaths(bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(reads).toBe(2)
  expect(first).toBe('waiting')
  // The same for a read of the edge that never answers.
  let matches = 0
  ;(globalThis as { caches?: unknown }).caches = { default: {
    match: () => ++matches === 1 ? new Promise(() => {}) : Promise.resolve(undefined),
    put: async () => {},
  } }
  const other = bucketOf({ [key]: 'M0 0' })
  let stuck: unknown = 'waiting'
  void glyphPaths(other.bucket, [{ ids: '⿰魚羊' }]).then(paths => { stuck = paths })
  await settle()
  expect(await glyphPaths(other.bucket, [{ ids: '⿰魚羊' }])).toEqual({ '⿰魚羊': 'M0 0' })
  expect(matches).toBe(2)
  expect(stuck).toBe('waiting')
})

const fileUrl = (name: string) => `${composerUrl('sans')}/${name}`
const fileKey = (name: string) => `composer/${composerVersion('sans')}/${name}`
// The composer, answering what it holds and 404 for the rest.
function composerOf(files: Record<string, string>, status = 404) {
  const asked: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    asked.push(url)
    const name = Object.keys(files).find(file => url === fileUrl(file))
    return name ? new Response(files[name]) : new Response('none', { status })
  }) as typeof fetch
  return asked
}

test('a composer file read once is not read from the bucket again', async () => {
  const asked = composerOf({})
  const { bucket, gets } = bucketOf({ [fileKey('manifest.json')]: '{"format":7}', [fileKey('g/07/07a3.json')]: new Uint8Array([1, 2, 3]) })
  const read = composerReader(bucket, 'sans')
  const first = await read(fileUrl('manifest.json'))
  expect(first.headers.get('content-type')).toBe('application/json')
  expect(await first.json()).toEqual({ format: 7 })
  // A request after it has a reader of its own over the same bucket.
  const again = await composerReader(bucket, 'sans')(new URL(fileUrl('manifest.json')))
  expect(again).not.toBe(first)
  expect(await again.json()).toEqual({ format: 7 })
  const shard = await read(new Request(fileUrl('g/07/07a3.json')))
  expect(shard.headers.get('content-type')).toBe('application/octet-stream')
  expect(new Uint8Array(await shard.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  expect(new Uint8Array(await (await read(fileUrl('g/07/07a3.json'))).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  expect(gets).toEqual([fileKey('manifest.json'), fileKey('g/07/07a3.json')])
  expect(asked).toEqual([])
})

test('a file the bucket lacks is fetched from the composer once, stored and kept', async () => {
  const edge = edgeOf()
  const asked = composerOf({ 'layout.json': '{"a":1}', 'p/0ab.json': '[2]' })
  const { bucket, objects, gets, puts } = bucketOf()
  const read = composerReader(bucket, 'sans')
  expect(await (await read(fileUrl('layout.json'))).json()).toEqual({ a: 1 })
  expect(await (await read(fileUrl('p/0ab.json'))).json()).toEqual([2])
  expect(await (await read(fileUrl('layout.json'))).json()).toEqual({ a: 1 })
  expect(await (await read(fileUrl('p/0ab.json'))).json()).toEqual([2])
  expect(asked).toEqual([fileUrl('layout.json'), fileUrl('p/0ab.json')])
  expect(gets).toEqual([fileKey('layout.json'), fileKey('p/0ab.json')])
  expect(puts).toEqual(gets)
  expect(new TextDecoder().decode(objects[fileKey('layout.json')] as Uint8Array)).toBe('{"a":1}')
  await settle()
  expect(edge.puts).toEqual(gets.map(key => `https://rare.glyphatlas.org/r2-kept/${key}`))
  // Another isolate takes both from the edge, asking neither the bucket nor the composer.
  const other = bucketOf()
  const otherRead = composerReader(other.bucket, 'sans')
  const layout = await otherRead(fileUrl('layout.json'))
  expect(layout.headers.get('content-type')).toBe('application/json')
  expect(await layout.json()).toEqual({ a: 1 })
  expect(await (await otherRead(fileUrl('p/0ab.json'))).json()).toEqual([2])
  expect(other.gets).toEqual([])
  expect(asked).toHaveLength(2)
  const matched = edge.matches.length
  expect(await (await otherRead(fileUrl('layout.json'))).json()).toEqual({ a: 1 })
  expect(edge.matches).toHaveLength(matched)
})

test('a shard the export lacks is not asked for again for five minutes', async () => {
  setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const edge = edgeOf()
  const asked = composerOf({})
  const { bucket, gets, puts } = bucketOf()
  const read = composerReader(bucket, 'sans')
  for (let i = 0; i < 3; i++) expect((await read(fileUrl('g/07/07a3.json'))).status).toBe(404)
  expect((await composerReader(bucket, 'sans')(fileUrl('g/07/07a3.json'))).status).toBe(404)
  expect(asked).toEqual([fileUrl('g/07/07a3.json')])
  expect(gets).toEqual([fileKey('g/07/07a3.json')])
  expect(puts).toEqual([])
  await settle()
  const marker = edge.held.get(`https://rare.glyphatlas.org/r2-kept/${fileKey('g/07/07a3.json')}`)!
  expect(marker.headers.get('cache-control')).toBe('public, max-age=300')
  // Another isolate learns it from the edge.
  const other = bucketOf()
  const otherRead = composerReader(other.bucket, 'sans')
  expect((await otherRead(fileUrl('g/07/07a3.json'))).status).toBe(404)
  expect(other.gets).toEqual([])
  expect(asked).toHaveLength(1)
  // One shard missing says nothing of another.
  expect((await read(fileUrl('p/0ab.json'))).status).toBe(404)
  expect(asked).toEqual([fileUrl('g/07/07a3.json'), fileUrl('p/0ab.json')])

  setSystemTime(new Date(Date.now() + MISSING_MS - 1000))
  expect((await read(fileUrl('g/07/07a3.json'))).status).toBe(404)
  expect((await otherRead(fileUrl('g/07/07a3.json'))).status).toBe(404)
  expect(asked).toHaveLength(2)

  // Five minutes on, both ask again, even where the edge still has the old answer; the shard is there now.
  setSystemTime(new Date(Date.now() + 1000))
  composerOf({ 'g/07/07a3.json': '{"k":1}' })
  expect(await (await read(fileUrl('g/07/07a3.json'))).json()).toEqual({ k: 1 })
  expect(gets.filter(key => key === fileKey('g/07/07a3.json'))).toHaveLength(2)
  expect(puts).toEqual([fileKey('g/07/07a3.json')])
  const third = bucketOf()
  edge.held.set(`https://rare.glyphatlas.org/r2-kept/${fileKey('g/07/07a3.json')}`, marker)
  expect(await (await composerReader(third.bucket, 'sans')(fileUrl('g/07/07a3.json'))).json()).toEqual({ k: 1 })
  expect(third.gets).toEqual([fileKey('g/07/07a3.json')])
})

test('only a missing shard is remembered: other failures are asked again', async () => {
  edgeOf()
  const { bucket } = bucketOf()
  const read = composerReader(bucket, 'sans')
  let asked = composerOf({})
  await expect(read(fileUrl('manifest.json'))).rejects.toThrow('manifest.json: 404')
  await expect(read(fileUrl('manifest.json'))).rejects.toThrow('manifest.json: 404')
  expect(asked).toHaveLength(2)
  asked = composerOf({}, 503)
  await expect(read(fileUrl('g/00/0000.json'))).rejects.toThrow('g/00/0000.json: 503')
  await expect(read(fileUrl('g/00/0000.json'))).rejects.toThrow('g/00/0000.json: 503')
  expect(asked).toHaveLength(2)
  asked = composerOf({ 'manifest.json': '{}', 'g/00/0000.json': '{}' })
  expect((await read(fileUrl('manifest.json'))).status).toBe(200)
  expect((await read(fileUrl('g/00/0000.json'))).status).toBe(200)
})

test('a composer file still being read for one request is read anew for the next', async () => {
  let reads = 0
  const bucket = {
    get: () => ++reads === 1 ? new Promise(() => {}) : Promise.resolve({ arrayBuffer: async () => new TextEncoder().encode('{"format":7}').buffer }),
    put: async () => {},
  } as unknown as Kept
  let first: unknown = 'waiting'
  void composerReader(bucket, 'sans')(fileUrl('manifest.json')).then(response => { first = response })
  await settle()
  expect(await (await composerReader(bucket, 'sans')(fileUrl('manifest.json'))).json()).toEqual({ format: 7 })
  expect(reads).toBe(2)
  expect(first).toBe('waiting')
})
