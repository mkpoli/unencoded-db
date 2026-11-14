import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { COMPOSER_VERSION } from '$lib/composer'
import { drawGlyph, glyphPaths } from './glyphs'
import { hashHex } from './image'

test('a page reads cached drawings by the cleaned description', async () => {
  const key = `glyphs/${COMPOSER_VERSION}/${await hashHex('⿰魚羊')}.txt`
  const bucket = {
    get: async (name: string) => name === key ? { text: async () => 'M0 0' } : null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  expect(await glyphPaths(bucket, [' ⿰ 魚 羊 ', null, '⿰木木'])).toEqual({ '⿰魚羊': 'M0 0' })
})

test('a page without a bucket shows no drawings', async () => {
  expect(await glyphPaths(undefined, ['⿰魚羊'])).toEqual({})
})


test('a bundled Bopomofo part draws through the build\'s asset binding', async () => {
  const outlines = await readFile(new URL('../../../node_modules/@han-compose/composer/data/sources/bopomofo/outlines.json.gz', import.meta.url))
  const bucket = {
    get: async () => null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  const assets = { fetch: async () => new Response(outlines) }
  expect(await drawGlyph(bucket, 'ㄍ', { assets, origin: 'https://example.test' })).toMatch(/^M/)
})
