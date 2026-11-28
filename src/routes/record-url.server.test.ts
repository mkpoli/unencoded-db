import { expect, test } from 'bun:test'
import { LOCALE_COOKIE } from '$lib/i18n'
import { isIndexable, isPublicPage } from '$lib/seo'
import { handle } from '../hooks.server'
import { match as matchRecordCode } from '../params/recordCode'

function run(url: string, options: { method?: string; preferred?: string; browser?: string } = {}) {
  const { method = 'GET', preferred, browser = 'zh-Hant' } = options
  const parsed = new URL(url)
  const request = new Request(url, { method, headers: { 'accept-language': browser } })
  const event = {
    request,
    url: parsed,
    route: { id: null },
    cookies: { get: (name: string) => name === LOCALE_COOKIE ? preferred : undefined },
    locals: {},
    platform: undefined,
  }
  return handle({ event: event as never, resolve: async () => new Response('ok') })
}

test('record URL redirects canonicalize legacy /entry/ and non-canonical codes in a single hop', async () => {
  for (const [input, status, location] of [
    ['https://rare.glyphatlas.org/zh-Hant/entry/9', 308, '/zh-Hant/R+0009'],
    ['https://rare.glyphatlas.org/zh-Hant/entry/9/history?before=5', 308, '/zh-Hant/R+0009/history?before=5'],
    ['https://rare.glyphatlas.org/zh-Hant/entry/9/stemma', 308, '/zh-Hant/R+0009/stemma'],
    ['https://rare.glyphatlas.org/en/entry/1734/sighting/3/edit', 308, '/en/R+06C6/sighting/3/edit'],
    ['https://rare.glyphatlas.org/en/entry/1/card.png?v=1', 308, '/en/R+0001/card.png?v=1'],
    ['https://rare.glyphatlas.org/zh-Hant/r+9/history', 308, '/zh-Hant/R+0009/history'],
    ['https://rare.glyphatlas.org/en/R%2B0009', 308, '/en/R+0009'],
    ['https://rare.glyphatlas.org/en/R%200009/history', 308, '/en/R+0009/history'],
    ['https://rare.glyphatlas.org/en/%E5%A4%A9%E5%A4%A9%E5%A4%A9%E6%9C%88', 308, '/en/R+0009'],
    ['https://rare.glyphatlas.org/R+0009', 302, '/zh-Hant/R+0009'],
    ['https://rare.glyphatlas.org/r+beef/history', 302, '/zh-Hant/R+BEEF/history'],
    ['https://rare.glyphatlas.org/entry/9/history', 302, '/zh-Hant/R+0009/history'],
  ] as const) {
    await expect(run(input)).rejects.toMatchObject({ status, location })
  }

  for (const canonical of [
    'https://rare.glyphatlas.org/zh-Hant/R+0009',
    'https://rare.glyphatlas.org/zh-Hant/R+0009/history',
    'https://rare.glyphatlas.org/en/R+10000',
    'https://rare.glyphatlas.org/en/about',
    'https://rare.glyphatlas.org/en/entry/0',
  ]) {
    expect((await run(canonical)).status).toBe(200)
  }

  // Legacy POST forms opened before deploy keep method and body via 308.
  await expect(run('https://rare.glyphatlas.org/en/entry/9?/edit', { method: 'POST' }))
    .rejects.toMatchObject({ status: 308, location: '/en/R+0009?/edit' })
})

test('recordCode param matcher and SEO indexability align with canonical R+XXXX paths', () => {
  for (const valid of ['R+0009', 'r+9', 'R+BEEF', 'R 0009', '天天天月']) expect(matchRecordCode(valid)).toBe(true)
  for (const invalid of ['entry', 'about', 'history', 'source', 'R+0000', '9', '']) expect(matchRecordCode(invalid)).toBe(false)

  expect(isPublicPage('/R+0009')).toBe(true)
  expect(isPublicPage('/R+10000')).toBe(true)
  expect(isIndexable('/R+0009', new URLSearchParams())).toBe(true)
  expect(isPublicPage('/R+0009/history')).toBe(false)
  expect(isPublicPage('/r+0009')).toBe(false)
  expect(isPublicPage('/entry/9')).toBe(false)
  expect(isPublicPage('/source/1')).toBe(true)
})
