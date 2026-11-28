import { parseRecordCode, recordCode } from './code'

export const SITE_ORIGIN = 'https://rare.glyphatlas.org'
export const PUBLIC_SECTIONS = ['', '/about', '/data', '/mcp', '/fonts', '/radicals', '/tags', '/chronology', '/sources'] as const

const LIST_PARAMS: Record<string, readonly string[]> = {
  '': ['q', 'also', 'script', 'filter', 'genre', 'collection', 'tag', 'creator', 'radical', 'decade', 'in', 'out', 'sort', 'seed', 'after', 'page', 'per'],
  '/chronology': ['at', 'before', 'from'],
  '/sources': ['sort', 'after'],
}

export function isPublicPage(path: string): boolean {
  if (PUBLIC_SECTIONS.some(section => section === path) || /^\/source\/[1-9]\d*$/.test(path)) return true
  const segment = path.startsWith('/') ? path.slice(1) : ''
  if (!segment || segment.includes('/')) return false
  const id = parseRecordCode(segment)
  return id !== null && segment === recordCode(id)
}

export function isIndexable(path: string, params: URLSearchParams): boolean {
  return isPublicPage(path) && !LIST_PARAMS[path]?.some(param => params.has(param))
}

export function snippet(text: string, limit = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const characters = [...normalized]
  return characters.length <= limit ? normalized : characters.slice(0, limit - 1).join('').trimEnd() + '…'
}
