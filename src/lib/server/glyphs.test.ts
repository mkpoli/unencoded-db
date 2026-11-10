import { expect, test } from 'bun:test'
import { COMPOSER_VERSION } from '$lib/composer'
import { glyphPaths } from './glyphs'
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
