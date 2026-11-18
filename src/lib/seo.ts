export const SITE_ORIGIN = 'https://rare.glyphatlas.org'
export const PUBLIC_SECTIONS = ['', '/about', '/data', '/fonts', '/radicals', '/tags', '/chronology', '/sources'] as const

const LIST_PARAMS: Record<string, readonly string[]> = {
  '': ['q', 'also', 'script', 'filter', 'genre', 'collection', 'tag', 'radical', 'decade', 'in', 'out', 'sort', 'seed', 'after'],
  '/chronology': ['at', 'before', 'from'],
  '/sources': ['sort', 'after'],
}

export function isPublicPage(path: string): boolean {
  return PUBLIC_SECTIONS.some(section => section === path) || /^\/(entry|source)\/[1-9]\d*$/.test(path)
}

export function isIndexable(path: string, params: URLSearchParams): boolean {
  return isPublicPage(path) && !LIST_PARAMS[path]?.some(param => params.has(param))
}

export function snippet(text: string, limit = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const characters = [...normalized]
  return characters.length <= limit ? normalized : characters.slice(0, limit - 1).join('').trimEnd() + '…'
}
