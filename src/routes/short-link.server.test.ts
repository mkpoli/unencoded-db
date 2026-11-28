import { expect, test } from 'bun:test'
import { LOCALE_COOKIE } from '$lib/i18n'
import { readShortRecordCode, shortRecordCode, shortShareUrl } from '$lib/short-record'
import { GET } from './[short=shortRecord]/+server'

function request(short: string, preferred?: string, browser = 'en') {
  return GET({
    params: { short },
    cookies: { get: name => name === LOCALE_COOKIE ? preferred : undefined },
    request: new Request(`https://rare.glyphatlas.org/${short}`, { headers: { 'accept-language': browser } }),
  } as Parameters<typeof GET>[0])
}

test('short record links redirect to the reader’s language without caching the preference', async () => {
  const preferred = await request('RN', 'zh-Hant', 'ja')
  expect(preferred.status).toBe(302)
  expect(preferred.headers.get('location')).toBe('/zh-Hant/R+06C6')
  expect(preferred.headers.get('vary')).toBe('Accept-Language, Cookie')
  expect(preferred.headers.get('cache-control')).toContain('no-store')
  expect((await request('RN', undefined, 'ja-JP')).headers.get('location')).toBe('/ja/R+06C6')
  expect((await request('RN', 'invalid', 'fr')).headers.get('location')).toBe('/en/R+06C6')
})

test('the codec uses the shortest available length and round-trips safe record IDs', () => {
  expect(shortRecordCode(1734)).toBe('RN')
  for (const [id, length] of [[1, 1], [36, 1], [37, 2], [2268, 2], [2269, 3], [Number.MAX_SAFE_INTEGER, 10]]) {
    const code = shortRecordCode(id)
    expect(code).toHaveLength(length)
    expect(readShortRecordCode(code)).toBe(id)
  }
})

test('short share URLs use the uppercase hexadecimal record code on mkpo.li', () => {
  expect(shortShareUrl(9)).toBe('https://mkpo.li/r/0009')
  expect(shortShareUrl(0xbeef)).toBe('https://mkpo.li/r/BEEF')
  expect(shortShareUrl(0x10000)).toBe('https://mkpo.li/r/10000')
})

test('short record links leave lowercase routes and locale prefixes available', () => {
  for (const code of ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'vi', 'api', 'auth', 'entry', 'fonts', 'RN!', 'Zzzzzzzzzz']) {
    expect(() => request(code)).toThrow(expect.objectContaining({ status: 404 }))
  }
})
