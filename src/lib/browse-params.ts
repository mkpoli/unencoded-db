import { isLocale } from './i18n'
import { ORDER, PAGE, orderOf, pageSizeOf, seedOf, type Order } from './order'
import { NEEDS } from './scripts'

export interface BrowseState {
  query?: string | null
  also?: readonly string[]
  filter?: string | null
  collection?: string | null
  tag?: string | null
  creator?: string | null
  radical?: string | null
  decade?: string | null
  within?: readonly string[]
  without?: readonly string[]
  order?: Order | string | null
  seed?: number | string | null
  per?: number | string | null
  page?: number | null
  after?: string | null
}

function uniqueNonEmpty(values?: readonly string[]): string[] {
  if (!values?.length) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

/**
 * Builds canonical browse query parameters, omitting empty values, default sort/page/per,
 * stale `also` without `q`, stale `seed` outside `sort=random`, and `page` when `after` is set.
 */
export function browseSearchParams(state: BrowseState): URLSearchParams {
  const params = new URLSearchParams()
  const query = (state.query ?? '').trim()
  if (query) {
    params.set('q', query)
    for (const spelling of uniqueNonEmpty(state.also)) params.append('also', spelling)
  }
  const filter = state.filter?.trim() ?? ''
  if (filter) params.set('filter', filter)
  const collection = state.collection?.trim() ?? ''
  const tag = state.tag?.trim() ?? ''
  if (collection) params.set('collection', collection)
  else if (tag) params.set('tag', tag)
  const creator = state.creator?.trim() ?? ''
  if (creator) params.set('creator', creator)
  const radical = state.radical?.trim() ?? ''
  if (radical) params.set('radical', radical)
  const decade = state.decade?.trim() ?? ''
  if (decade) params.set('decade', decade)
  for (const id of uniqueNonEmpty(state.within)) params.append('in', id)
  for (const id of uniqueNonEmpty(state.without)) params.append('out', id)

  const orderRaw = state.order?.trim() || null
  const order = orderOf(orderRaw)
  if (order && order !== ORDER) params.set('sort', order)
  if (order === 'random') {
    const seed = seedOf(state.seed === null || state.seed === undefined ? null : String(state.seed).trim())
    if (seed !== null) params.set('seed', String(seed))
  }

  const perRaw = state.per === null || state.per === undefined ? null : String(state.per).trim()
  const per = perRaw && Number(perRaw) !== PAGE ? pageSizeOf(perRaw) : null
  if (per !== null && per !== PAGE) params.set('per', String(per))

  const after = state.after?.trim() ?? ''
  if (after) params.set('after', after)
  else if (typeof state.page === 'number' && Number.isInteger(state.page) && state.page > 1) params.set('page', String(state.page))

  return params
}

/** Formats a canonical browse URL from a locale root path and browse state. */
export function browseHref(base: string, state: BrowseState): string {
  const params = browseSearchParams(state)
  return params.size ? `${base}?${params}` : base
}

/**
 * Canonicalizes a browse query string or URLSearchParams, stripping empty/default/unknown params
 * and normalizing legacy `genre` and `script` to `tag`.
 */
export function cleanBrowseSearch(search: string | URLSearchParams): string {
  const input = typeof search === 'string' ? new URLSearchParams(search) : search
  const pageRaw = input.get('page')?.trim() ?? ''
  const page = /^[1-9]\d*$/.test(pageRaw) ? Number(pageRaw) : null
  const legacyScript = input.get('script')?.trim() ?? ''
  const rawTag = input.get('tag') ?? input.get('genre') ?? (legacyScript && legacyScript !== 'other' ? legacyScript : null)
  const params = browseSearchParams({
    query: input.get('q'),
    also: input.getAll('also'),
    filter: input.get('filter'),
    collection: input.get('collection'),
    tag: rawTag?.normalize('NFC') ?? null,
    creator: input.get('creator')?.normalize('NFC') ?? null,
    radical: input.get('radical')?.normalize('NFC') ?? null,
    decade: input.get('decade'),
    within: input.getAll('in'),
    without: input.getAll('out'),
    order: input.get('sort'),
    seed: input.get('seed'),
    per: input.get('per'),
    page,
    after: input.get('after'),
  })
  return params.size ? `?${params}` : ''
}

/**
 * Extracts a canonical browse query string from a same-origin referrer URL pointing to a locale browse root.
 * Returns null if the referrer is absent, cross-origin, or not a browse page.
 */
export function browseSearchFromReferrer(referrer: string, origin: string): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.origin !== origin) return null
    const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    if (segments.length !== 1 || !isLocale(segments[0])) return null
    return cleanBrowseSearch(url.searchParams)
  } catch {
    return null
  }
}

/**
 * Resolves the `filter` param when submitting the browse filter bar:
 * selecting a need applies it; clearing the needs dropdown preserves an active status filter.
 */
export function mergeFilter(need: string, activeFilter: string | null): string | null {
  const chosen = need.trim()
  if (chosen) return chosen
  if (activeFilter && !(NEEDS as readonly string[]).includes(activeFilter)) return activeFilter
  return null
}

/** Toggles a registry work chip on or off, clearing the opposite chip for the same work. */
export function toggleMark(
  within: readonly string[],
  without: readonly string[],
  id: string,
  side: 'in' | 'out',
): { within: string[]; without: string[] } {
  const active = side === 'in' ? within.includes(id) : without.includes(id)
  const next = {
    within: within.filter(item => item !== id),
    without: without.filter(item => item !== id),
  }
  if (!active) {
    if (side === 'in') next.within.push(id)
    else next.without.push(id)
  }
  return next
}
