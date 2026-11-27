import { expect, test } from 'bun:test'
import {
  browseHref,
  browseSearchFromReferrer,
  browseSearchParams,
  cleanBrowseSearch,
  mergeFilter,
  toggleMark,
} from './browse-params'
import { BrowseReturnTracker } from './browse-return-tracker'

test('browseSearchParams omits empty and default values and preserves active filters', () => {
  expect(browseSearchParams({}).toString()).toBe('')
  expect(browseSearchParams({
    query: '   ',
    also: ['⿰木木'],
    filter: '',
    tag: '',
    decade: '',
    order: 'most',
    seed: 123,
    per: 48,
    page: 1,
  }).toString()).toBe('')

  const full = browseSearchParams({
    query: ' ⿰木木 ',
    also: ['⿰木木', '⿰木木', ''],
    filter: 'encoded',
    tag: 'hakka',
    radical: '木',
    decade: '1930',
    within: ['uax45', 'uax45'],
    without: ['uk'],
    order: 'random',
    seed: 42,
    per: 96,
    page: 3,
  })
  expect(full.get('q')).toBe('⿰木木')
  expect(full.getAll('also')).toEqual(['⿰木木'])
  expect(full.get('filter')).toBe('encoded')
  expect(full.get('tag')).toBe('hakka')
  expect(full.get('radical')).toBe('木')
  expect(full.get('decade')).toBe('1930')
  expect(full.getAll('in')).toEqual(['uax45'])
  expect(full.getAll('out')).toEqual(['uk'])
  expect(full.get('sort')).toBe('random')
  expect(full.get('seed')).toBe('42')
  expect(full.get('per')).toBe('96')
  expect(full.get('page')).toBe('3')
})

test('browseSearchParams prefers collection over tag and after over page', () => {
  const params = browseSearchParams({
    collection: 'irg',
    tag: 'hakka',
    page: 2,
    after: '10.20',
  })
  expect(params.get('collection')).toBe('irg')
  expect(params.has('tag')).toBe(false)
  expect(params.get('after')).toBe('10.20')
  expect(params.has('page')).toBe(false)
})

test('browseHref returns bare locale path when no params remain', () => {
  expect(browseHref('/zh-Hant', {})).toBe('/zh-Hant')
  expect(browseHref('/zh-Hant', { query: '木', tag: 'han' })).toBe('/zh-Hant?q=%E6%9C%A8&tag=han')
})

test('cleanBrowseSearch strips empty, default, stale and unknown params and normalizes legacy genre and script', () => {
  expect(cleanBrowseSearch('?q=&script=&filter=&tag=&decade=')).toBe('')
  expect(cleanBrowseSearch('?q=+foo+&script=&filter=encoded&tag=&decade=&sort=most&per=48&page=1&seed=99&unknown=1'))
    .toBe('?q=foo&filter=encoded')
  expect(cleanBrowseSearch('?genre=hakka&script=han')).toBe('?tag=hakka')
  expect(cleanBrowseSearch('?tag=&genre=hakka&script=han')).toBe('')
  expect(cleanBrowseSearch('?also=%E2%BF%B0%E6%9C%A8%E6%9C%A8&script=han')).toBe('?tag=han')
  expect(cleanBrowseSearch('?script=other')).toBe('')
  expect(cleanBrowseSearch('?sort=random&seed=12345&page=2')).toBe('?sort=random&seed=12345&page=2')
})

test('browseSearchFromReferrer accepts only same-origin locale browse roots', () => {
  const origin = 'https://rare.glyphatlas.org'
  expect(browseSearchFromReferrer(`${origin}/zh-Hant?q=%E6%9C%A8&script=&filter=encoded`, origin))
    .toBe('?q=%E6%9C%A8&filter=encoded')
  expect(browseSearchFromReferrer(`${origin}/en/`, origin)).toBe('')
  expect(browseSearchFromReferrer(`${origin}/zh-Hant/entry/42?about=1`, origin)).toBeNull()
  expect(browseSearchFromReferrer(`${origin}/zh-Hant/sources?q=test`, origin)).toBeNull()
  expect(browseSearchFromReferrer(`${origin}/xx?q=test`, origin)).toBeNull()
  expect(browseSearchFromReferrer('https://evil.example/en?q=test', origin)).toBeNull()
  expect(browseSearchFromReferrer('', origin)).toBeNull()
  expect(browseSearchFromReferrer('not-a-url', origin)).toBeNull()
})

test('mergeFilter preserves active status while allowing needs to be set or cleared', () => {
  expect(mergeFilter('image', null)).toBe('image')
  expect(mergeFilter('image', 'encoded')).toBe('image')
  expect(mergeFilter('', 'encoded')).toBe('encoded')
  expect(mergeFilter('', 'unifiable')).toBe('unifiable')
  expect(mergeFilter('', 'image')).toBeNull()
  expect(mergeFilter('', 'ids')).toBeNull()
  expect(mergeFilter('', null)).toBeNull()
})

test('toggleMark toggles a registry chip and clears the opposite side', () => {
  expect(toggleMark([], [], 'uax45', 'in')).toEqual({ within: ['uax45'], without: [] })
  expect(toggleMark(['uax45'], [], 'uax45', 'in')).toEqual({ within: [], without: [] })
  expect(toggleMark(['uax45'], [], 'uax45', 'out')).toEqual({ within: [], without: ['uax45'] })
  expect(toggleMark(['uax45'], ['uk'], 'uk', 'in')).toEqual({ within: ['uax45', 'uk'], without: [] })
})

test('BrowseReturnTracker keeps older record tied to its own search across browse A -> record A -> browse B -> Back', () => {
  const tracker = new BrowseReturnTracker()
  // Enter browse A
  tracker.track({ type: 'enter', fromRoute: null, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '?q=alpha&tag=han' })
  expect(tracker.savedSearch).toBe('?q=alpha&tag=han')
  expect(tracker.directFromBrowse).toBe(false)

  // Open record A from browse A
  tracker.track({
    type: 'link',
    fromRoute: '/[locale]',
    fromLocale: 'zh-Hant',
    fromSearch: '?q=alpha&tag=han',
    toRoute: '/[locale]/entry/[id]',
    toLocale: 'zh-Hant',
  })
  expect(tracker.savedSearch).toBe('?q=alpha&tag=han')
  expect(tracker.directFromBrowse).toBe(true)

  // Navigate to browse B
  tracker.track({
    type: 'link',
    fromRoute: '/[locale]/entry/[id]',
    fromLocale: 'zh-Hant',
    toRoute: '/[locale]',
    toLocale: 'zh-Hant',
    toSearch: '?q=beta',
  })
  expect(tracker.savedSearch).toBe('?q=beta')
  expect(tracker.directFromBrowse).toBe(false)

  // Browser Back to record A must restore search A and keep direct history.back()
  tracker.track({
    type: 'popstate',
    delta: -1,
    fromRoute: '/[locale]',
    fromLocale: 'zh-Hant',
    fromSearch: '?q=beta',
    toRoute: '/[locale]/entry/[id]',
    toLocale: 'zh-Hant',
  })
  expect(tracker.savedSearch).toBe('?q=alpha&tag=han')
  expect(tracker.directFromBrowse).toBe(true)
})

test('BrowseReturnTracker handles hashchange, multi-hop history links, and reload hydration', () => {
  const tracker = new BrowseReturnTracker()
  tracker.track({ type: 'enter', fromRoute: null, toRoute: '/[locale]', toLocale: 'en', toSearch: '?q=wood' })
  tracker.track({
    type: 'link',
    fromRoute: '/[locale]',
    fromLocale: 'en',
    fromSearch: '?q=wood',
    toRoute: '/[locale]/entry/[id]',
    toLocale: 'en',
  })
  expect(tracker.directFromBrowse).toBe(true)

  // In-page hash navigation invalidates direct history.back()
  tracker.clearDirect()
  expect(tracker.directFromBrowse).toBe(false)
  expect(tracker.savedSearch).toBe('?q=wood')

  // Multi-hop link from history back to record keeps search without history.back()
  tracker.track({ type: 'link', fromRoute: '/[locale]/entry/[id]', toRoute: '/[locale]/entry/[id]/history' })
  tracker.track({ type: 'link', fromRoute: '/[locale]/entry/[id]/history', toRoute: '/[locale]/entry/[id]' })
  expect(tracker.directFromBrowse).toBe(false)
  expect(tracker.savedSearch).toBe('?q=wood')

  // Reload on record hydrates saved search and survives browse B -> Back
  const reloaded = new BrowseReturnTracker()
  reloaded.track({ type: 'enter', fromRoute: null, toRoute: '/[locale]/entry/[id]', toLocale: 'en' })
  reloaded.hydrate('?q=wood&tag=han', null)
  expect(reloaded.savedSearch).toBe('?q=wood&tag=han')
  expect(reloaded.directFromBrowse).toBe(false)
  reloaded.track({ type: 'link', fromRoute: '/[locale]/entry/[id]', toRoute: '/[locale]', toLocale: 'en', toSearch: '?q=other' })
  reloaded.track({ type: 'popstate', delta: -1, fromRoute: '/[locale]', fromLocale: 'en', fromSearch: '?q=other', toRoute: '/[locale]/entry/[id]', toLocale: 'en' })
  expect(reloaded.savedSearch).toBe('?q=wood&tag=han')
  expect(reloaded.directFromBrowse).toBe(false)
})

test('BrowseReturnTracker records returning entry for highlight and multi-hop scroll', () => {
  const tracker = new BrowseReturnTracker()
  tracker.track({ type: 'enter', fromRoute: null, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '?q=wood' })
  tracker.track({ type: 'link', fromRoute: '/[locale]', fromLocale: 'zh-Hant', fromSearch: '?q=wood', toRoute: '/[locale]/entry/[id]', toLocale: 'zh-Hant' })

  // Direct return via ← 記錄 highlights without overriding browser/snapshot scroll
  tracker.markReturning(42, false)
  tracker.track({ type: 'popstate', delta: -1, fromRoute: '/[locale]/entry/[id]', fromEntryId: 42, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '?q=wood' })
  expect(tracker.consumeReturning()).toEqual({ id: 42, scroll: false })
  expect(tracker.consumeReturning()).toBeNull()

  // Browser Back from record without clicking ← 記錄 still highlights the tile
  tracker.track({ type: 'link', fromRoute: '/[locale]', fromLocale: 'zh-Hant', fromSearch: '?q=wood', toRoute: '/[locale]/entry/[id]', toLocale: 'zh-Hant' })
  tracker.track({ type: 'popstate', delta: -1, fromRoute: '/[locale]/entry/[id]', fromEntryId: 77, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '?q=wood' })
  expect(tracker.consumeReturning()).toEqual({ id: 77, scroll: false })

  // Multi-hop return via ← 記錄 marks scroll: true so the browse grid centers the tile
  tracker.markReturning(99, true)
  tracker.track({ type: 'link', fromRoute: '/[locale]/entry/[id]', fromEntryId: 99, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '?q=wood' })
  expect(tracker.consumeReturning()).toEqual({ id: 99, scroll: true })

  // Clicking top-nav Records (plain link without markReturning) does not highlight or scroll
  tracker.track({ type: 'link', fromRoute: '/[locale]/entry/[id]', fromEntryId: 99, toRoute: '/[locale]', toLocale: 'zh-Hant', toSearch: '' })
  expect(tracker.consumeReturning()).toBeNull()
})

test('a maker is kept in the address as written', () => {
  expect(browseSearchParams({ creator: ' 陸貫一 ' }).get('creator')).toBe('陸貫一')
  expect(cleanBrowseSearch('?creator=&decade=')).toBe('')
  expect(cleanBrowseSearch('?creator=%E9%99%B8%E8%B2%AB%E4%B8%80&unknown=1')).toBe('?creator=%E9%99%B8%E8%B2%AB%E4%B8%80')
})
