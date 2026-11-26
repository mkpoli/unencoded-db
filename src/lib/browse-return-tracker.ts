import { cleanBrowseSearch } from './browse-params'

export interface BrowseNavEvent {
  type: string
  delta?: number
  fromRoute: string | null
  fromLocale?: string | null
  fromSearch?: string
  toRoute: string | null
  toLocale?: string | null
  toSearch?: string
}

interface EntryBackState {
  search: string
  direct: boolean
}

/**
 * Pure history tracker for the record page's "← Records" link.
 * Keeps each visited record history slot associated with the browse search that led to it
 * and decides when history.back() returns directly to that same-locale browse listing.
 */
export class BrowseReturnTracker {
  savedSearch = ''
  directFromBrowse = false
  private cursor = 0
  private readonly entries = new Map<number, EntryBackState>()

  remember(search: string): string {
    const clean = cleanBrowseSearch(search)
    this.savedSearch = clean
    return clean
  }

  hydrate(stored: string | null, referrerSearch: string | null): string | null {
    if (stored !== null) {
      this.savedSearch = cleanBrowseSearch(stored)
      const recorded = this.entries.get(this.cursor)
      if (recorded && !recorded.search) this.entries.set(this.cursor, { search: this.savedSearch, direct: recorded.direct })
      return null
    }
    if (referrerSearch !== null) {
      this.savedSearch = referrerSearch
      const recorded = this.entries.get(this.cursor)
      if (recorded && !recorded.search) this.entries.set(this.cursor, { search: this.savedSearch, direct: recorded.direct })
      return referrerSearch
    }
    return null
  }

  track(event: BrowseNavEvent): string | null {
    if (event.type === 'popstate' && typeof event.delta === 'number') {
      this.cursor += event.delta
    } else if (event.type !== 'enter') {
      this.cursor += 1
      for (const key of this.entries.keys()) {
        if (key >= this.cursor) this.entries.delete(key)
      }
    }

    if (event.toRoute === '/[locale]') {
      const clean = this.remember(event.toSearch ?? '')
      this.directFromBrowse = false
      return clean
    }

    if (event.toRoute === '/[locale]/entry/[id]') {
      if (event.type === 'popstate') {
        const recorded = this.entries.get(this.cursor)
        if (recorded) {
          this.savedSearch = recorded.search
          this.directFromBrowse = recorded.direct
          return recorded.search
        }
        if (event.fromRoute === '/[locale]' && event.delta === 1) {
          const clean = this.remember(event.fromSearch ?? '')
          const direct = Boolean(event.fromLocale && event.fromLocale === event.toLocale)
          this.directFromBrowse = direct
          this.entries.set(this.cursor, { search: clean, direct })
          return clean
        }
        this.directFromBrowse = false
        return null
      }

      if (event.fromRoute === '/[locale]' && (event.type === 'link' || event.type === 'goto')) {
        const clean = this.remember(event.fromSearch ?? '')
        const direct = Boolean(event.fromLocale && event.fromLocale === event.toLocale)
        this.directFromBrowse = direct
        this.entries.set(this.cursor, { search: clean, direct })
        return clean
      }

      this.directFromBrowse = false
      this.entries.set(this.cursor, { search: this.savedSearch, direct: false })
      return null
    }

    this.directFromBrowse = false
    return null
  }

  clearDirect() {
    this.directFromBrowse = false
    const recorded = this.entries.get(this.cursor)
    if (recorded) this.entries.set(this.cursor, { search: recorded.search, direct: false })
  }
}
