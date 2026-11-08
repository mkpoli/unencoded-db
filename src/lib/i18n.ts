import en from '../../messages/en.json'
import ja from '../../messages/ja.json'
import ko from '../../messages/ko.json'
import vi from '../../messages/vi.json'
import zhHans from '../../messages/zh-Hans.json'
import zhHant from '../../messages/zh-Hant.json'

export const LOCALES = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'vi'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
  vi: 'Tiếng Việt',
}

export type MessageKey = keyof typeof en
export const catalogues: Record<Locale, Record<string, string>> = { en, ja, ko, vi, 'zh-Hans': zhHans, 'zh-Hant': zhHant }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

function decodeSegment(segment: string | undefined): string | undefined {
  if (!segment) return segment
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The locale a path starts with, or null when it has no valid locale prefix. */
export function localeFromPathname(pathname: string): Locale | null {
  const first = decodeSegment(pathname.split('/')[1])
  return isLocale(first) ? first : null
}

/** A language tag reduced to one of the six interface locales. */
function matchLocale(tag: string): Locale | null {
  const lower = tag.toLowerCase()
  if (lower === '*') return null
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja'
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko'
  if (lower === 'vi' || lower.startsWith('vi-')) return 'vi'
  if (lower === 'zh-hant' || lower.startsWith('zh-hant-')) return 'zh-Hant'
  if (/^zh-(tw|hk|mo)(?:-|$)/.test(lower)) return 'zh-Hant'
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh-Hans'
  return null
}

/**
 * The interface locale for an Accept-Language header: the highest-quality supported language,
 * keeping the header's order for equal qualities, and English when nothing matches.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  const ranked: { tag: string; quality: number; order: number }[] = []
  for (const part of (header ?? '').split(',')) {
    const [rawTag, ...parameters] = part.split(';')
    const tag = rawTag.trim()
    if (!tag) continue
    let quality = 1
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(parameter)
      if (!match) continue
      const value = Number(match[1])
      quality = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
    }
    if (quality > 0) ranked.push({ tag, quality, order: ranked.length })
  }
  ranked.sort((a, b) => b.quality - a.quality || a.order - b.order)
  for (const { tag } of ranked) {
    const locale = matchLocale(tag)
    if (locale) return locale
  }
  return 'en'
}

/** The path of a page in `locale`: every locale sits under its own prefix. */
export function localizedHref(locale: Locale, path = '/'): string {
  if (!path || path === '/') return `/${locale}`
  return `/${locale}${path.startsWith('/') ? path : `/${path}`}`
}

/** The path after a valid locale prefix, or the path unchanged when it has none. */
export function pathAfterLocale(pathname: string): string {
  const parts = pathname.split('/')
  if (!isLocale(decodeSegment(parts[1]))) return pathname
  const rest = parts.slice(2).join('/')
  return rest ? `/${rest}` : ''
}

/** The same page in another locale, keeping its path and query string. */
export function switchLocaleHref(locale: Locale, pathname: string, search = ''): string {
  return `${localizedHref(locale, pathAfterLocale(pathname) || '/')}${search}`
}

/** A timestamp as a date in the locale, or the original text when it is not a date. */
export function formatDate(locale: Locale, value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/** The message for `key` in `locale`, with `{name}` placeholders filled from `values`. */
export function t(locale: Locale, key: MessageKey | string, values: Record<string, string | number> = {}): string {
  const messages = catalogues[locale] ?? en
  const text = messages[key] ?? (en as Record<string, string>)[key] ?? key
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
}
