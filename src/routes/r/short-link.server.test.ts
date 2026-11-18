import { expect, test } from 'bun:test'
import { LOCALE_COOKIE } from '$lib/i18n'
import { GET } from './[id]/+server'

function request(id: string, preferred?: string, browser = 'en') {
  return GET({
    params: { id },
    cookies: { get: name => name === LOCALE_COOKIE ? preferred : undefined },
    request: new Request(`https://rare.glyphatlas.org/r/${id}`, { headers: { 'accept-language': browser } }),
  } as Parameters<typeof GET>[0])
}

test('short record links redirect to the reader’s language without caching the preference', async () => {
  const preferred = await request('1734', 'zh-Hant', 'ja')
  expect(preferred.status).toBe(302)
  expect(preferred.headers.get('location')).toBe('/zh-Hant/entry/1734')
  expect(preferred.headers.get('vary')).toBe('Accept-Language, Cookie')
  expect(preferred.headers.get('cache-control')).toContain('no-store')
  expect((await request('1734', undefined, 'ja-JP')).headers.get('location')).toBe('/ja/entry/1734')
  expect((await request('1734', 'invalid', 'fr')).headers.get('location')).toBe('/en/entry/1734')
})

test('short record links reject noncanonical numbers', () => {
  for (const id of ['0', '0001', 'Infinity', '9007199254740992']) {
    expect(() => request(id)).toThrow(expect.objectContaining({ status: 404 }))
  }
})
