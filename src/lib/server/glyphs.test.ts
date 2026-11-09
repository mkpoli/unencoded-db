import { expect, test } from 'bun:test'
import { COMPOSER_VERSION } from '../composer'
import { glyphPaths } from './glyphs'

test('a page reads cached drawings by the cleaned description', async () => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('⿰魚羊')))
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  const key = `glyphs/${COMPOSER_VERSION}/${hash}.txt`
  const bucket = {
    get: async (name: string) => name === key ? { text: async () => 'M0 0' } : null,
    put: async () => {},
  } as unknown as Pick<R2Bucket, 'get' | 'put'>
  expect(await glyphPaths(bucket, [' ⿰ 魚 羊 ', null, '⿰木木'])).toEqual({ '⿰魚羊': 'M0 0' })
})

test('a page without a bucket shows no drawings', async () => {
  expect(await glyphPaths(undefined, ['⿰魚羊'])).toEqual({})
})
