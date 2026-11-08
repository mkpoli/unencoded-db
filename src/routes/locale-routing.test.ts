import { describe, expect, test } from 'bun:test'
import { load as redirectToLocale } from './+page.server'
import { load as localeLayout } from './[locale]/+layout.server'
import { load as localizedNotFound } from './[locale]/[...rest]/+page.server'
import { LOCALES } from '../lib/i18n'

function request(header?: string, path = '/') {
  const headers = new Headers()
  if (header !== undefined) headers.set('accept-language', header)
  let responseHeaders: Record<string, string> = {}
  return {
    event: { request: new Request(`https://example.test${path}`, { headers }), url: new URL(`https://example.test${path}`), setHeaders: (values: Record<string, string>) => { responseHeaders = values } },
    headers: () => responseHeaders,
  }
}

function thrown(fn: () => unknown) {
  try { fn() } catch (error) { return error as { status?: number; location?: string } }
  throw new Error('Expected the function to throw')
}

describe('locale routing', () => {
  test('redirects / to the negotiated locale with 303', () => {
    const { event, headers } = request('ja-JP,ja;q=0.9,en;q=0.8')
    expect(thrown(() => redirectToLocale(event as any))).toMatchObject({ status: 303, location: '/ja' })
    expect(headers()).toEqual({ vary: 'Accept-Language' })
  })

  test('keeps the query string when redirecting /', () => {
    const { event } = request('zh-TW', '/?before=12')
    expect(thrown(() => redirectToLocale(event as any))).toMatchObject({ status: 303, location: '/zh-Hant?before=12' })
  })

  test('falls back to English for an unknown language', () => {
    const { event } = request('fr-FR,de;q=0.8')
    expect(thrown(() => redirectToLocale(event as any))).toMatchObject({ status: 303, location: '/en' })
  })

  test('returns the locale the layout validated', () => {
    for (const locale of LOCALES) expect(localeLayout({ params: { locale } } as any)).toEqual({ locale })
  })

  test('rejects unknown and malformed locale segments with 404', () => {
    for (const locale of ['fr', 'zh_hans', 'EN', 'zh-Hans-x', '']) {
      expect(thrown(() => localeLayout({ params: { locale } } as any)).status, locale).toBe(404)
    }
  })

  test('raises a localized 404 for other paths under a valid locale', () => {
    expect(thrown(() => localizedNotFound({} as any)).status).toBe(404)
  })
})
