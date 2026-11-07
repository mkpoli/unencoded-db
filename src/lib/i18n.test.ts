import { describe, expect, test } from 'bun:test'
import {
  LOCALES,
  isLocale,
  localeFromPathname,
  localizedHref,
  negotiateLocale,
  pathAfterLocale,
  switchLocaleHref,
  formatDate,
  t,
  type Locale,
} from './i18n'

describe('locale negotiation', () => {
  const cases: [string | null | undefined, Locale][] = [
    [undefined, 'en'],
    [null, 'en'],
    ['', 'en'],
    ['ja', 'ja'],
    ['ja-JP', 'ja'],
    ['ko-KR,ko;q=0.9,en;q=0.8', 'ko'],
    ['vi-VN', 'vi'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-Hans', 'zh-Hans'],
    ['zh', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['en-GB', 'en'],
    ['fr-FR,ja;q=0.8,en;q=0.7', 'ja'],
    ['de;q=0.9,ja;q=0.8', 'ja'],
    ['ja;q=0.4,ko;q=0.9', 'ko'],
    ['zh-TW;q=0.4,zh-Hans;q=0.9', 'zh-Hans'],
    ['ja;q=0,en;q=0.5', 'en'],
    ['ko;q=0.8,vi;q=0.8', 'ko'],
    [' ZH-Hant ; q=0.7 ', 'zh-Hant'],
    ['*', 'en'],
    [';;;', 'en'],
    ['fr-FR', 'en'],
    ['fr-FR,de;q=0.8', 'en'],
  ]

  for (const [header, expected] of cases) {
    test(`${JSON.stringify(header)} negotiates ${expected}`, () => {
      expect(negotiateLocale(header)).toBe(expected)
    })
  }
})

describe('locale values', () => {
  test('lists the six interface locales in URL order', () => {
    expect([...LOCALES]).toEqual(['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'vi'])
  })

  test('validates exact locale segments only', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true)
    for (const value of ['fr', 'EN', 'zh_hans', 'zh-hans', '', null, undefined, 1]) expect(isLocale(value)).toBe(false)
  })

  test('reads a locale from a pathname', () => {
    expect(localeFromPathname('/ja/new')).toBe('ja')
    expect(localeFromPathname('/zh-Hans')).toBe('zh-Hans')
    expect(localeFromPathname('/en/')).toBe('en')
    expect(localeFromPathname('/fr/x')).toBeNull()
    expect(localeFromPathname('/')).toBeNull()
    expect(localeFromPathname('/%6a%61/new')).toBe('ja')
    expect(localeFromPathname('/%zz/new')).toBeNull()
  })
})

describe('localized links', () => {
  test('prefixes every path with the locale', () => {
    expect(localizedHref('en')).toBe('/en')
    expect(localizedHref('ja', '/')).toBe('/ja')
    expect(localizedHref('ja', '/new')).toBe('/ja/new')
    expect(localizedHref('vi', '/entry/12')).toBe('/vi/entry/12')
    expect(localizedHref('ko', 'new')).toBe('/ko/new')
    expect(localizedHref('zh-Hant', '/')).toBe('/zh-Hant')
  })

  test('strips a valid locale prefix only', () => {
    expect(pathAfterLocale('/ja/new')).toBe('/new')
    expect(pathAfterLocale('/ja')).toBe('')
    expect(pathAfterLocale('/en/')).toBe('')
    expect(pathAfterLocale('/new')).toBe('/new')
    expect(pathAfterLocale('/fr/x')).toBe('/fr/x')
    expect(pathAfterLocale('/%6a%61/new')).toBe('/new')
  })

  test('keeps the path and query string when switching language', () => {
    expect(switchLocaleHref('ja', '/zh-Hans/entry/1', '?before=5')).toBe('/ja/entry/1?before=5')
    expect(switchLocaleHref('vi', '/ja')).toBe('/vi')
    expect(switchLocaleHref('ko', '/ja/', '?q=1')).toBe('/ko?q=1')
    expect(switchLocaleHref('en', '/vi/new')).toBe('/en/new')
    expect(switchLocaleHref('en', '/%6a%61/entry/7', '?before=5')).toBe('/en/entry/7?before=5')
  })
})

describe('translation lookup', () => {
  test('returns approved copy and fills placeholders', () => {
    expect(t('ja', 'error.home')).toBe('記録一覧に戻る')
    expect(t('en', 'entry.record', { id: 3 })).toBe('Record 3')
    expect(t('ko', 'entry.record', { id: 3 })).toBe('기록 3')
    expect(t('vi', 'entry.record', { id: 3 })).toBe('Mục từ 3')
  })

  test('falls back to English for an unknown key', () => {
    expect(t('ja', 'not.a.key')).toBe('not.a.key')
  })
})

describe('dates', () => {
  test('formats a timestamp in each locale and leaves invalid text alone', () => {
    for (const locale of LOCALES) {
      expect(formatDate(locale, '2026-11-01T00:00:00.000Z'), locale).toContain('2026')
    }
    expect(formatDate('en', '2026-11-08T00:30:00.000Z')).toBe(formatDate('en', '2026-11-08T23:30:00.000Z'))
    expect(formatDate('ja', 'not a date')).toBe('not a date')
  })
})
