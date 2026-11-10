import en from '../../messages/en.json'
import ja from '../../messages/ja.json'
import ko from '../../messages/ko.json'
import vi from '../../messages/vi.json'
import zhHans from '../../messages/zh-Hans.json'
import zhHant from '../../messages/zh-Hant.json'

export const LOCALES = ['en', 'ja', 'zh-Hant', 'zh-Hans', 'ko', 'vi'] as const
export type Locale = (typeof LOCALES)[number]
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ja: '日本語', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文', ko: '한국어', vi: 'Tiếng Việt' }
export const LOCALE_COOKIE = 'ug.locale'
export type MessageKey = keyof typeof en

const CATALOGUES: Record<Locale, Record<string, string>> = { en, ja, ko, vi, 'zh-Hans': zhHans, 'zh-Hant': zhHant }
export const catalogues = CATALOGUES

export const isLocale = (value: string | undefined | null): value is Locale => LOCALES.includes(value as Locale)

export function negotiate(cookie: string | undefined, header: string | null): Locale {
  if (isLocale(cookie)) return cookie
  for (const part of (header ?? '').split(',')) {
    const tag = part.split(';')[0].trim()
    if (isLocale(tag)) return tag
    if (/^zh-(TW|HK|MO|Hant)/i.test(tag)) return 'zh-Hant'
    if (/^zh/i.test(tag)) return 'zh-Hans'
    const language = tag.split('-')[0].toLowerCase()
    if (isLocale(language)) return language
  }
  return 'en'
}

export function translate(locale: string, key: MessageKey | string, values?: Record<string, string | number>) {
  const message = CATALOGUES[locale as Locale]?.[key] ?? (en as Record<string, string>)[key] ?? key
  return values ? message.replace(/\{(\w+)\}/g, (whole, name) => String(values[name] ?? whole)) : message
}
