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

  async function layoutEvent(locale: string, options: { token?: string; linked?: string | null; name?: string | null; picture?: string | null; moderator?: string | null } = {}) {
    return {
      params: { locale },
      locals: { moderator: options.moderator ?? null },
      url: new URL(`https://example.test/${locale}`),
      platform: {
        env: {
          ATLAS_ISSUER: 'https://id.example',
          ATLAS_CLIENT_ID: 'client',
          ATLAS_CLIENT_SECRET: 'secret',
          ATLAS_PUBLIC_ORIGIN: 'https://example.test',
          DB: { prepare: () => ({ bind: () => ({ first: async () => options.linked === undefined ? null : { linked: options.linked, name: options.name ?? null, picture: options.picture ?? null } }) }) },
        },
      },
      cookies: { get: () => options.token },
    }
  }

  test('returns the locale and anonymous layout state', async () => {
    for (const locale of LOCALES) {
      const event = await layoutEvent(locale)
      event.platform = undefined as any
      expect(await localeLayout(event as any)).toEqual({ locale, signInEnabled: false, signedIn: false, hasSession: false, profile: null, isModerator: false })
    }
  })

  test('reads the session and linked account from the layout cookie', async () => {
    const anonymous = await localeLayout(await layoutEvent('ja', { token: 'a'.repeat(64), linked: null }) as any)
    expect(anonymous).toEqual({ locale: 'ja', signInEnabled: true, signedIn: false, hasSession: true, profile: null, isModerator: false })
    const linked = await localeLayout(await layoutEvent('ja', { token: 'a'.repeat(64), linked: 'person-1', name: 'Rina', picture: 'https://id.example/avatar.webp' }) as any)
    expect(linked).toEqual({ locale: 'ja', signInEnabled: true, signedIn: true, hasSession: true, profile: { name: 'Rina', picture: 'https://id.example/avatar.webp' }, isModerator: false })
  })

  test('marks the layout for a verified moderator', async () => {
    const event = await layoutEvent('ja', { moderator: 'mod@example.com' })
    expect((await localeLayout(event as any) as { isModerator: boolean }).isModerator).toBe(true)
  })

  test('rejects unknown and malformed locale segments with 404', async () => {
    for (const locale of ['fr', 'zh_hans', 'EN', 'zh-Hans-x', '']) {
      await expect(localeLayout({ params: { locale }, url: new URL('https://example.test/'), platform: undefined, cookies: { get: () => undefined } } as any)).rejects.toMatchObject({ status: 404 })
    }
  })

  test('raises a localized 404 for other paths under a valid locale', () => {
    expect(thrown(() => localizedNotFound({} as any)).status).toBe(404)
  })
})
