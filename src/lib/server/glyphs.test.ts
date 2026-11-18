import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { composerDrawing, glyphStyleOf } from '$lib/composer'
import { drawGlyph, glyphName, glyphPaths, sourceKey } from './glyphs'
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
