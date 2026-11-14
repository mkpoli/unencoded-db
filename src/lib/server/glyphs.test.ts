import { expect, test } from 'bun:test'
import { COMPOSER_VERSION } from '$lib/composer'
import { glyphName, glyphPaths } from './glyphs'
import { hashHex } from './image'

test('a page reads cached drawings by the cleaned description', async () => {
  const key = `glyphs/${COMPOSER_VERSION}/${await hashHex('⿰魚羊')}.txt`
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
  const key = `glyphs/${COMPOSER_VERSION}/${await hashHex(glyphName(moved))}.txt`
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
