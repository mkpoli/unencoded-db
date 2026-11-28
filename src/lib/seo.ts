import { parseRecordCode, recordCode } from './code'

export const SITE_ORIGIN = 'https://rare.glyphatlas.org'
export const PUBLIC_SECTIONS = ['', '/about', '/data', '/mcp', '/fonts', '/radicals', '/tags', '/chronology', '/sources'] as const

const LIST_PARAMS: Record<string, readonly string[]> = {
  '': ['q', 'also', 'script', 'filter', 'genre', 'collection', 'tag', 'creator', 'radical', 'decade', 'in', 'out', 'sort', 'seed', 'after', 'page', 'per'],
  '/chronology': ['at', 'before', 'from'],
  '/sources': ['q', 'publisher', 'sort', 'after'],
}

const PART_LIST_PARAMS = ['func', 'unlabeled', 'after'] as const
const COPY_LIST_PARAMS = ['after'] as const
const COPY_PATH = /^\/sources\/copy\/[a-z0-9][a-z0-9-]*$/

// Lightweight guard mirroring `validPartKey` without pulling `ids-input` tables into `Seo.svelte`.
// Non-canonical parts 301-redirect in `part/[part]/+page.server.ts` before `<Seo>` renders.
function isPartPath(path: string): boolean {
  if (!path.startsWith('/part/')) return false
  const raw = path.slice('/part/'.length)
  if (!raw || raw.includes('/')) return false
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return false
  }
  const chars = [...decoded]
  if (!chars.length || chars.length > 200 || /[\p{Cc}\s]/u.test(decoded)) return false
  return chars.some(char => !/[\u2FF0-\u2FFF\u31EF\u303E]/u.test(char))
}

function listParamsFor(path: string): readonly string[] | undefined {
  if (path in LIST_PARAMS) return LIST_PARAMS[path]
  if (path.startsWith('/part/')) return PART_LIST_PARAMS
  if (path.startsWith('/sources/copy/')) return COPY_LIST_PARAMS
  return undefined
}

export function isPublicPage(path: string): boolean {
  if (
    PUBLIC_SECTIONS.some(section => section === path) ||
    /^\/source\/[1-9]\d*$/.test(path) ||
    COPY_PATH.test(path) ||
    isPartPath(path)
  ) return true
  const segment = path.startsWith('/') ? path.slice(1) : ''
  if (!segment || segment.includes('/')) return false
  const id = parseRecordCode(segment)
  return id !== null && segment === recordCode(id)
}

export function isIndexable(path: string, params: URLSearchParams): boolean {
  return isPublicPage(path) && !listParamsFor(path)?.some(param => params.has(param))
}

export function snippet(text: string, limit = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const characters = [...normalized]
  return characters.length <= limit ? normalized : characters.slice(0, limit - 1).join('').trimEnd() + '…'
}
