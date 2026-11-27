import { expect, test } from 'bun:test'
import { uncachedWhenMissing } from './build-files'

const kept = 'public, immutable, max-age=31536000'
const answer = (status: number) => new Response(status < 400 ? 'x' : null, { status, headers: { 'cache-control': kept } })

test('a missing build file is not kept, and a found one keeps its headers', () => {
  const missing = uncachedWhenMissing(new Request('https://rare.glyphatlas.org/_app/immutable/entry/start.abc.js'), answer(404))
  expect([missing.status, missing.headers.get('cache-control')]).toEqual([404, 'no-store'])
  const found = uncachedWhenMissing(new Request('https://rare.glyphatlas.org/_app/immutable/entry/start.abc.js'), answer(200))
  expect(found.headers.get('cache-control')).toBe(kept)
  const page = uncachedWhenMissing(new Request('https://rare.glyphatlas.org/en/entry/1'), answer(404))
  expect(page.headers.get('cache-control')).toBe(kept)
})
