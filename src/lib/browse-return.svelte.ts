import type { AfterNavigate } from '@sveltejs/kit'
import { browser } from '$app/environment'
import { browseSearchFromReferrer } from './browse-params'
import { BrowseReturnTracker } from './browse-return-tracker'

const STORAGE_KEY = 'ug.browse'

const tracker = new BrowseReturnTracker()
let savedSearch = $state('')
let directFromBrowse = $state(false)

function syncState() {
  savedSearch = tracker.savedSearch
  directFromBrowse = tracker.directFromBrowse
}

function writeStorage(value: string) {
  if (!browser) return
  try { sessionStorage.setItem(STORAGE_KEY, value) } catch { /* storage unavailable */ }
}

function readStorage(): string | null {
  if (!browser) return null
  try { return sessionStorage.getItem(STORAGE_KEY) } catch { return null }
}

/** Records the latest canonical browse query string for this tab. */
export function rememberBrowse(search: string) {
  const clean = tracker.remember(search)
  syncState()
  writeStorage(clean)
}

/**
 * Restores remembered browse params after hydration from sessionStorage,
 * falling back to a same-origin browse referrer (e.g. opened in a new tab).
 */
export function hydrateBrowseReturn() {
  if (!browser) return
  const stored = readStorage()
  const fromReferrer = stored === null ? browseSearchFromReferrer(document.referrer, window.location.origin) : null
  const toPersist = tracker.hydrate(stored, fromReferrer)
  syncState()
  if (toPersist !== null) writeStorage(toPersist)
}

/** Updates remembered browse query and whether history.back() returns directly to it. */
export function trackBrowseNavigation(navigation: AfterNavigate) {
  const toPersist = tracker.track({
    type: navigation.type,
    delta: navigation.delta,
    fromRoute: navigation.from?.route.id ?? null,
    fromLocale: navigation.from?.params?.locale ?? null,
    fromSearch: navigation.from?.url.search ?? '',
    toRoute: navigation.to?.route.id ?? null,
    toLocale: navigation.to?.params?.locale ?? null,
    toSearch: navigation.to?.url.search ?? '',
  })
  syncState()
  if (toPersist !== null) writeStorage(toPersist)
}

/** Invalidates direct history.back() after an in-page hash navigation pushes a history entry. */
export function clearDirectBrowseBack() {
  tracker.clearDirect()
  syncState()
}

/** Returns the browse link target for the current locale, preserving the last search params. */
export const browseReturnHref = (base: string) => `${base}${savedSearch}`

/** True when the immediately preceding browser history entry is the same-locale browse listing. */
export const canReturnViaHistory = () => directFromBrowse
