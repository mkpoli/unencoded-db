<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte'
  import { afterNavigate, beforeNavigate, goto, invalidateAll, preloadData, replaceState } from '$app/navigation'
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { COLLECTIONS, arrangeTags, localized } from '$lib/tags'
  import { MARKED } from '$lib/registries'
  import { ORDER, PAGE, PAGE_SIZES, SORTS, pageSteps } from '$lib/order'
  import { STATUSES, NEEDS, SCRIPTS } from '$lib/scripts'
  import { describedTable } from '$lib/encoded'
  import { cleanIds } from '$lib/ids'
  import { equivalentSpellings, isParts, partSpellings } from '$lib/ids-variants'
  import { isDescription } from 'ids-input'
  import ChatLinks from '$lib/components/ChatLinks.svelte'
  import GlyphStyleTabs from '$lib/components/GlyphStyleTabs.svelte'
  import { GLYPH_STYLE_COOKIE, type GlyphStyle } from '$lib/composer'
  import { decadeNumber } from '$lib/dates'
  import { decadeName, href, locale, t, yearsName } from '$lib/t'
  import { TILE_SIZE_COOKIE, TILE_SIZES, pageColumns, tileSizeOf } from '$lib/tile-size'
  import { browseHref, browseSearchParams, mergeFilter, toggleMark, type BrowseState } from '$lib/browse-params'
  import { consumeReturningEntry, rememberBrowse } from '$lib/browse-return.svelte'
  import { parseRecordCode } from '$lib/code'
  import type { Snapshot } from './$types'
  let { data } = $props()
  const tagSections = $derived(arrangeTags(localized(data.tags, locale()), localized(data.groups, locale())))
  const currentState = $derived<BrowseState>({
    query: data.query,
    also: data.also,
    script: data.script,
    filter: data.filter,
    collection: data.collection,
    tag: data.tag,
    radical: data.radical,
    decade: data.decade,
    within: data.within,
    without: data.without,
    order: data.order,
    seed: data.seed,
    per: data.per,
    page: data.number,
    after: page.url.searchParams.get('after'),
  })
  // Further pages are appended as the list nears its end. They belong to the listing they were read for,
  // and a new listing starts again from its own first page.
  type Shown = { for: typeof data; tiles: typeof data.tiles; glyphs: Record<string, string | null>; next: string | null; partial: boolean; total: typeof data.total; scanned: number }
  const fresh = (from: typeof data): Shown => ({ for: from, tiles: from.tiles, glyphs: from.glyphs ?? {}, next: from.next, partial: from.partial, total: from.total, scanned: from.read })
  let loaded = $state.raw<Shown | null>(null)
  const shown = $derived(loaded?.for === data ? loaded : fresh(data))
  const REACH = 1200
  let sentinel = $state<HTMLElement>()
  let observer: IntersectionObserver | undefined
  let near = $state(false)
  // The listing a read is on its way for. A read for a listing left behind neither holds up nor frees the next.
  let busyFor = $state.raw<typeof data | null>(null)
  const busy = $derived(busyFor === data)
  let failedFor = $state.raw<typeof data | null>(null)
  const more = $derived(browseHref(href(), { ...currentState, page: null, after: shown.next }))
  async function grow() {
    if (busy || shown.next === null) return
    const from = data, base = shown, target = more
    busyFor = from
    try {
      const result = await preloadData(target)
      if (from !== data) return
      // A failed SvelteKit preload can return the current page's data and status.
      if (result.type !== 'loaded' || result.status !== 200 || result.data === page.data) { failedFor = from; return }
      const next = result.data as typeof data
      // A record already shown is not added twice, whatever the page that brings it again.
      const shownIds = new Set(base.tiles.map(tile => tile.id))
      loaded = { for: from, tiles: [...base.tiles, ...next.tiles.filter(tile => !shownIds.has(tile.id))], glyphs: { ...base.glyphs, ...next.glyphs }, next: next.next, partial: next.partial, total: base.total, scanned: base.scanned + next.read }
      failedFor = null
      // The sentinel has moved down. Until the observer looks at it again it is taken to be far, and it is
      // observed afresh so the observer reports where it is now, even if scrolling has brought it back.
      await tick()
      near = false
      if (observer && sentinel) { observer.unobserve(sentinel); observer.observe(sentinel) }
    } catch {
      if (from === data) failedFor = from
    } finally {
      if (busyFor === from) busyFor = null
    }
  }
  $effect(() => {
    if (!sentinel) return
    void data
    const watching = new IntersectionObserver(entries => { near = entries.at(-1)!.isIntersecting }, { rootMargin: `0px 0px ${REACH}px 0px` })
    observer = watching
    watching.observe(sentinel)
    return () => { watching.disconnect(); observer = undefined; near = false }
  })
  // An incomplete search window can contain no matches. Finish scanning in the
  // background even when the sentinel is below the viewport.
  let mounted = $state(false)
  onMount(() => { mounted = true })
  const left = $derived(shown.total ? shown.total.n - shown.tiles.length : null)
  const done = $derived(shown.total !== null && !shown.total.floor && left !== null && left <= 0)
  const pagesLeft = $derived(left !== null && left > 0 ? Math.ceil(left / data.per) : null)
  $effect(() => { if (mounted && (shown.partial || near) && !busy && failedFor !== data && !done && shown.next !== null) grow() })
  const appendOnClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    grow()
  }
  // Form controls stay synced with the URL parameters across navigations and back/forward steps.
  let queryInput = $state<HTMLInputElement>()
  let query = $state(untrack(() => data.query ?? ''))
  let script = $state(untrack(() => data.script ?? ''))
  let need = $state(untrack(() => NEEDS.includes(data.filter as never) ? (data.filter ?? '') : ''))
  let tag = $state(untrack(() => data.tag ?? ''))
  let decade = $state(untrack(() => data.decade ?? ''))
  const searchInvalid = $derived(Boolean(data.searchError && query.trim() === data.query))
  const hasFilters = $derived(Boolean(data.query || data.script || data.filter || data.collection || data.tag || data.radical || data.decade || data.within.length || data.without.length))
  const clearedFilters = $derived(browseHref(href(), { order: data.order, seed: data.seed, per: data.per }))
  function syncControls() {
    query = data.query ?? ''
    script = data.script ?? ''
    need = NEEDS.includes(data.filter as never) ? (data.filter ?? '') : ''
    tag = data.tag ?? ''
    decade = data.decade ?? ''
  }
  // Returning to the list brings back the pages read so far; a reload starts again from the first.
  // SvelteKit scrolls before it restores them, so the place is set again once they are drawn. Drawings
  // are asked for again as tiles come into view.
  let arrival = ''
  let alive = true
  let navTicket = 0
  let navigatingTo = $state<string | null>(null)
  let resolvingIds = $state(false)
  const filtering = $derived(navigatingTo !== null || resolvingIds)
  let returnedEntry = $state<number | null>(null)
  let highlightTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => {
    alive = false
    filterTicket++
    navTicket++
    resolvingIds = false
    clearTimeout(highlightTimer)
  })
  beforeNavigate(() => {
    filterTicket++
    navTicket++
    resolvingIds = false
    clearTimeout(highlightTimer)
  })
  afterNavigate(navigation => {
    arrival = navigation.type
    navigatingTo = null
    resolvingIds = false
    syncControls()
    const canonical = browseHref(href(), currentState)
    const canonicalSearch = canonical.includes('?') ? canonical.slice(canonical.indexOf('?')) : ''
    rememberBrowse(canonicalSearch)
    clearTimeout(highlightTimer)
    const returned = consumeReturningEntry()
    returnedEntry = returned?.id ?? null
    if (returned && browser) {
      void tick().then(() => {
        if (!alive || returnedEntry !== returned.id) return
        if (returned.scroll) {
          grid?.querySelector<HTMLElement>(`a.tile[data-entry="${returned.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
        }
        highlightTimer = setTimeout(() => { if (returnedEntry === returned.id) returnedEntry = null }, 1400)
      })
    }
    if (browser) {
      const target = `${canonical}${page.url.hash}`
      const ticket = ++navTicket
      if (target !== `${location.pathname}${location.search}${location.hash}`) {
        // Defer until after SvelteKit finishes initial hydration (started = true).
        queueMicrotask(() => {
          if (!alive || ticket !== navTicket) return
          if (target !== `${location.pathname}${location.search}${location.hash}`) replaceState(target, page.state)
        })
      }
    }
  })
  const reloaded = () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
  export const snapshot: Snapshot<{ tiles: Shown['tiles']; next: string | null; partial: boolean; total: Shown['total']; scanned: number; y: number } | null> = {
    capture: () => loaded?.for === data ? { tiles: loaded.tiles, next: loaded.next, partial: loaded.partial, total: loaded.total, scanned: loaded.scanned, y: scrollY } : null,
    restore: value => {
      if (!value || (arrival === 'enter' && reloaded())) return
      const { y, ...pages } = value
      loaded = { ...pages, total: pages.total ?? null, scanned: pages.scanned ?? 0, glyphs: data.glyphs ?? {}, for: data }
      tick().then(() => {
        scrollTo(scrollX, y)
        requestAnimationFrame(() => scrollTo(scrollX, y))
      })
    }
  }
  // A new order drops the place and the shuffle's start; shuffling again deals a new start.
  const sorted = (order: string) => browseHref(href(), { ...currentState, order, seed: null, page: null, after: null })
  // The reader's tile width, set on the document so the server-drawn list and a moved slider agree.
  // The document holds the width last chosen in this tab; the layout's data holds the one the first page was drawn at.
  let tileSize = $state(tileSizeOf(browser ? document.documentElement.dataset.tileSize : String(page.data.tileSize)))
  // The display setting answers at once while the server reads the page again and draws its glyphs in the new style.
  // The choice stays until the page it drew holds it, so a failed read leaves the tab and the cookie in step.
  let shownStyle = $state<GlyphStyle | null>(null)
  const glyphStyle = $derived(shownStyle ?? data.glyphStyle)
  let switching = 0
  async function setGlyphStyle(style: GlyphStyle) {
    if (style === glyphStyle) return
    const previous = data.glyphStyle, ticket = ++switching
    shownStyle = style
    document.cookie = `${GLYPH_STYLE_COOKIE}=${style};path=/;max-age=31536000;samesite=lax`
    try {
      await invalidateAll()
    } catch {
      // A failed read leaves no preview behind: the tab and the cookie go back to the style the page holds.
      if (ticket === switching) {
        document.cookie = `${GLYPH_STYLE_COOKIE}=${previous};path=/;max-age=31536000;samesite=lax`
      }
    } finally {
      if (ticket === switching) shownStyle = null
    }
  }
  // The grid's columns divide a page, so each page read ends on a full row. Without scripts the grid fits as many as it can.
  let grid = $state<HTMLElement>()
  $effect(() => {
    if (!grid) return
    const node = grid, tile = tileSize
    const fit = () => { node.style.gridTemplateColumns = `repeat(${pageColumns(node.clientWidth, Math.min(tile, node.clientWidth), parseFloat(getComputedStyle(node).columnGap) || 0, data.per)},minmax(0,1fr))` }
    const watching = new ResizeObserver(fit)
    watching.observe(node)
    fit()
    return () => watching.disconnect()
  })
  function sizeTiles(index: number) {
    tileSize = TILE_SIZES[index] ?? tileSize
    document.cookie = `${TILE_SIZE_COOKIE}=${tileSize};path=/;max-age=31536000;samesite=lax`
    document.documentElement.dataset.tileSize = String(tileSize)
  }
  // A whole description, or parts typed with no structure (艹時), is also searched under its other spellings,
  // which the table in the browser knows. Without the table, or without scripts, it is searched as typed.
  let filterTicket = 0
  async function applyFilters(options: { noScroll?: boolean; keepFocus?: boolean } = {}, overrides: Partial<BrowseState> = {}) {
    const ticket = ++filterTicket
    resolvingIds = false
    const trimmed = query.trim()
    const cleaned = cleanIds(trimmed)
    const whole = isDescription(cleaned)
    const parts = !whole && isParts(cleaned)
    let spellings: string[] = []
    if (trimmed === data.query && data.also.length) {
      spellings = data.also
    } else if (whole || parts) {
      resolvingIds = true
      try {
        const table = await describedTable()
        if (ticket !== filterTicket) return
        spellings = whole ? equivalentSpellings(cleaned, table).slice(1) : partSpellings(cleaned, table).slice(1)
      } catch { /* searched as typed */ } finally {
        if (ticket === filterTicket) resolvingIds = false
      }
    }
    if (!alive || ticket !== filterTicket) return
    const target = browseHref(href(), {
      query: trimmed,
      also: spellings,
      script,
      filter: mergeFilter(need, data.filter),
      collection: pinned?.name === 'collection' ? pinned.value : null,
      tag: pinned?.name === 'tag' ? pinned.value : pinned ? null : tag,
      radical: data.radical,
      decade,
      within: data.within,
      without: data.without,
      order: data.order,
      seed: data.seed,
      per: data.per,
      ...overrides,
    })
    const current = browser ? `${location.pathname}${location.search}` : `${page.url.pathname}${page.url.search}`
    if (navigatingTo === null && target === current) {
      syncControls()
      return
    }
    if (navigatingTo === target) return
    navigatingTo = target
    const gotoOptions = parseRecordCode(trimmed) !== null ? {} : options
    try {
      await goto(target, gotoOptions)
    } finally {
      if (navigatingTo === target) navigatingTo = null
    }
  }
  const controlsDirty = () =>
    script !== (data.script ?? '') ||
    need !== (NEEDS.includes(data.filter as never) ? (data.filter ?? '') : '') ||
    (!pinned && tag !== (data.tag ?? '')) ||
    decade !== (data.decade ?? '')
  function search(event: SubmitEvent) {
    event.preventDefault()
    void applyFilters({ noScroll: true, keepFocus: true })
  }
  function clearQuery() {
    filterTicket++
    resolvingIds = false
    query = ''
    queryInput?.focus()
    if (data.query || navigatingTo !== null || controlsDirty()) void applyFilters({ noScroll: true, keepFocus: true })
  }
  function queryKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || !query) return
    event.preventDefault()
    filterTicket++
    resolvingIds = false
    query = ''
    if (controlsDirty()) void applyFilters({ noScroll: true, keepFocus: true })
  }
  // When the reader edited #q without submitting yet, clicking a status, sort, or work chip keeps that query.
  function chipClick(event: MouseEvent, overrides: Partial<BrowseState>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (query.trim() === data.query) return
    event.preventDefault()
    void applyFilters({ noScroll: true }, overrides)
  }
  const count = (key: string) => data.counts?.[key] ?? 0
  // The list's address without its place, which the page form keeps and adds a page to.
  const unplaced = $derived([...browseSearchParams({ ...currentState, page: null, after: null })])
  // Another page size starts the list again from its first page.
  const sized = (size: number) => browseHref(href(), { ...currentState, per: size, page: null, after: null })
  const paged = (number: number) => browseHref(href(), { ...currentState, page: number, after: null })
  function turn(event: SubmitEvent) {
    event.preventDefault()
    const typed = Number(new FormData(event.currentTarget as HTMLFormElement).get('page'))
    goto(paged(Number.isInteger(typed) && typed > 1 ? Math.min(typed, data.pages ?? typed) : 1))
  }
  // The pages on screen: the one opened and those the list has grown by since.
  const lastOpen = $derived(Math.min(data.pages ?? data.number, data.number + Math.max(1, Math.ceil(shown.tiles.length / data.per)) - 1))
  const steps = $derived(pageSteps(data.number, lastOpen, data.pages ?? 1))
  const firstShown = $derived((data.number - 1) * data.per + 1)
  // The decades records were first seen in, by century, oldest first.
  const centuries = $derived.by(() => {
    // The chosen decade stays an option when it holds no record now, so the form keeps it.
    const held = Object.keys(data.counts ?? {}).filter(key => key.startsWith('y:')).map(key => Number(key.slice(2)))
    const decades = [...new Set([...held, ...(data.decade ? [Number(data.decade)] : [])])].sort((a, b) => a - b)
    const byCentury = new Map<string, number[]>()
    for (const decade of decades) {
      const century = Math.floor(decadeNumber(decade) / 100) * 100
      const label = decade < 0 ? yearsName(-98 - century, century ? 1 - century : 0) : `${century}–${century + 99}`
      byCentury.set(label, [...(byCentury.get(label) ?? []), decade])
    }
    return [...byCentury]
  })
  const knownTag = $derived(data.tag ? data.tags.find(item => item.name === data.tag) ?? null : null)
  // A collection or an unlisted tag is chosen by following a link, and stays until it is cleared.
  const pinned = $derived(data.collection ? { name: 'collection', value: data.collection, label: COLLECTIONS.find(item => item.slug === data.collection)?.label ?? data.collection } : data.tag && !knownTag ? { name: 'tag', value: data.tag, label: `#${data.tag}` } : null)
  const withFilter = (filter: string) => browseHref(href(), { ...currentState, filter: filter || null, page: null, after: null })
  // A work's two chips: one keeps the list to the records in it, the other to the ones not in it. A chip
  // that is on turns itself off, and turning one on turns the other off.
  const withMark = (id: string, name: 'in' | 'out') => browseHref(href(), { ...currentState, ...toggleMark(data.within, data.without, id, name), page: null, after: null })
  const unpinned = $derived(browseHref(href(), { ...currentState, collection: null, tag: null, page: null, after: null }))
  const unfiled = $derived(browseHref(href(), { ...currentState, radical: null, page: null, after: null }))
</script>

{#snippet sizes()}
  <nav class="sizes" aria-label={t('browse.perPage')} data-sveltekit-preload-data="tap"><span aria-hidden="true">{t('browse.perPage')}</span>{#each PAGE_SIZES as size}<a class="chip" class:on={data.per === size} aria-current={data.per === size ? 'true' : undefined} href={sized(size)}>{size}</a>{/each}</nav>
{/snippet}
{#snippet turner(id: string)}
  {@const last = data.pages ?? 1}
  <nav class="pages" aria-label={t('browse.page')} data-sveltekit-preload-data="tap">
    {#if data.number > 1}<a class="chip" rel="prev" href={paged(data.number - 1)} aria-label={t('browse.previousPage')} title={t('browse.previousPage')}><span aria-hidden="true">‹</span></a>{:else}<span class="chip off" aria-hidden="true">‹</span>{/if}
    {#each steps as step, index (step ?? `gap${index}`)}
      {#if step === null}<span class="gap" aria-hidden="true">…</span>{:else}<a class="chip" class:on={step >= data.number && step <= lastOpen} class:far={(step === data.number - 2 && steps[index - 1] === null) || (step === lastOpen + 2 && steps[index + 1] === null)} aria-current={step === data.number ? 'page' : undefined} href={paged(step)}>{step}</a>{/if}
    {/each}
    {#if lastOpen < last}<a class="chip" rel="next" href={paged(lastOpen + 1)} aria-label={t('browse.nextPage')} title={t('browse.nextPage')}><span aria-hidden="true">›</span></a>{:else}<span class="chip off" aria-hidden="true">›</span>{/if}
  </nav>
  <form class="jump" method="GET" onsubmit={turn}>
    {#each unplaced as [name, value]}<input type="hidden" {name} {value} />{/each}
    <label for={id}>{t('browse.page')}</label>
    {#key data.number}<input class="input" {id} name="page" inputmode="numeric" pattern="[1-9][0-9]*" autocomplete="off" value={data.number} />{/key}
    <span aria-hidden="true">/</span><span>{last}</span>
    <button class="button" type="submit">{t('browse.go')}</button>
  </form>
{/snippet}
<Seo />
<div class="page stack">
  <div class="heading">
    <div class="stack intro"><h1>{t('nav.browse')}</h1><p class="muted">{t('browse.intro')}</p><p class="chats"><ChatLinks /></p></div>
    <a class="button primary" href={href('/new')}>{t('browse.addOne')}</a>
  </div>
  <search>
  <form class="filters" action={href()} method="GET" onsubmit={search}>
    <div class="search field">
      <label for="q">{t('browse.searchLabel')}</label>
      <div class="search-box">
        <input
          class="input"
          class:has-clear={Boolean(query)}
          id="q"
          name="q"
          type="search"
          enterkeyhint="search"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          bind:this={queryInput}
          bind:value={query}
          onkeydown={queryKeydown}
          placeholder={t('browse.search')}
          aria-invalid={searchInvalid ? 'true' : undefined}
          aria-describedby={searchInvalid ? 'search-error search-hint' : 'search-hint'}
        />
        {#if query}<button class="clear-input" type="button" aria-label={t('sources.clear')} onclick={clearQuery}><span aria-hidden="true">×</span></button>{/if}
      </div>
    </div>
    <div class="field"><label for="script">{t('field.script')}</label><select class="input" class:active={Boolean(script)} id="script" name="script" bind:value={script} onchange={() => applyFilters({ noScroll: true, keepFocus: true })}><option value="">{t('browse.all')}</option>{#each SCRIPTS as item (item.id)}{#if count(`s:${item.id}`) || data.script === item.id}<option value={item.id}>{t(`script.${item.id}`)} ({count(`s:${item.id}`)})</option>{/if}{/each}</select></div>
    <div class="field"><label for="filter">{t('browse.needs')}</label><select class="input" class:active={Boolean(need)} id="filter" name="filter" bind:value={need} onchange={() => applyFilters({ noScroll: true, keepFocus: true })}><option value="">{t('browse.all')}</option>{#each NEEDS as item}<option value={item}>{t(`needs.${item}`)} ({count(`n:${item}`)})</option>{/each}</select></div>
    {#if pinned}
      <div class="field"><span class="label">{t(pinned.name === 'tag' ? 'field.tags' : 'field.collection')}</span><input type="hidden" name={pinned.name} value={pinned.value} /><a class="pinned" href={unpinned} aria-label="{pinned.label} ×">{pinned.label} <span aria-hidden="true">×</span></a></div>
    {:else}
      <div class="field"><label for="tag">{t('field.tags')}</label><select class="input" class:active={Boolean(tag)} id="tag" name="tag" bind:value={tag} onchange={() => applyFilters({ noScroll: true, keepFocus: true })}>
        <option value="">{t('browse.all')}</option>
        {#each tagSections as section (section.type)}{#each section.shelves as shelf (shelf.group?.id ?? 0)}<optgroup label={shelf.group ? `${t(`tagType.${section.type}`)} › ${shelf.group.label}` : t(`tagType.${section.type}`)}>{#each shelf.tags as item (item.name)}<option value={item.name}>{item.label} ({item.n})</option>{/each}</optgroup>{/each}{/each}
      </select></div>
    {/if}
    <div class="field decade"><label for="decade">{t('browse.decadeLabel')}</label><select class="input" class:active={Boolean(decade)} id="decade" name="decade" bind:value={decade} onchange={() => applyFilters({ noScroll: true, keepFocus: true })}>
      <option value="">{t('browse.all')}</option>
      {#each centuries as [century, decades] (century)}<optgroup label={century}>{#each decades as item (item)}<option value={String(item)}>{decadeName(item)} ({count(`y:${item}`)})</option>{/each}</optgroup>{/each}
    </select></div>
    <div class="field radical"><span class="label" id="radical-label">{t('field.radical')}</span>{#if data.radical}{@const radical = [...data.radical].at(-1)}<input type="hidden" name="radical" value={data.radical} /><a class="pinned" href={unfiled} aria-label="{t('field.radical')} {radical} ×"><span class="glyph">{radical}</span> <span aria-hidden="true">×</span></a>{:else}<a class="input choose" id="radical-choice" href={href('/radicals')} aria-labelledby="radical-label radical-choice">{t('browse.all')}<span aria-hidden="true">›</span></a>{/if}</div>
    {#if data.order !== ORDER}<input type="hidden" name="sort" value={data.order} />{/if}
    {#if data.seed !== null}<input type="hidden" name="seed" value={data.seed} />{/if}
    {#if data.per !== PAGE}<input type="hidden" name="per" value={data.per} />{/if}
    {#each data.within as id}<input type="hidden" name="in" value={id} />{/each}{#each data.without as id}<input type="hidden" name="out" value={id} />{/each}
    <div class="filter-actions">
      <button class="button" type="submit" aria-busy={filtering || undefined}>{t('browse.filter')}</button>
      {#if hasFilters}<a class="text-link clear-filters" href={clearedFilters}>{t('sources.clear')}</a>{/if}
    </div>
  </form>
  </search>
  <div class="filter-foot">
    <p class="hint" id="search-hint">{t('browse.idsHint')}</p>
    <div class="glyph-setting">
      <span class="glyph-setting-label" aria-hidden="true">{t('nav.glyphStyle')}</span>
      <GlyphStyleTabs value={glyphStyle} onchange={setGlyphStyle} />
    </div>
  </div>
  <div class="bar">
  <nav class="states" aria-label={t('field.status')}>
    <a class="chip" class:on={!data.filter} aria-current={!data.filter ? 'true' : undefined} href={withFilter('')} onclick={event => chipClick(event, { filter: null })}>{t('browse.all')} <span class="n">{count('all')}</span></a>
    {#each STATUSES as status}{#if count(`f:${status}`) || data.filter === status}<a class="chip" class:on={data.filter === status} aria-current={data.filter === status ? 'true' : undefined} href={withFilter(status)} onclick={event => chipClick(event, { filter: status })}>{t(`status.${status}`)} <span class="n">{count(`f:${status}`)}</span></a>{/if}{/each}
  </nav>
  <div class="view">
    <nav class="sort" aria-label={t('browse.sort')}>{#each SORTS as order}<a class="chip" class:on={data.order === order} aria-current={data.order === order ? 'true' : undefined} href={sorted(order)} title={order === 'earliest' || order === 'latest' ? t('browse.order.dated') : undefined} onclick={event => chipClick(event, { order, seed: null })}>{t(`browse.order.${order}`)}</a>{/each}<a class="chip shuffle" class:on={data.order === 'random'} aria-current={data.order === 'random' ? 'true' : undefined} href={sorted('random')} data-sveltekit-preload-data="off" onclick={event => chipClick(event, { order: 'random', seed: null })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h3c4 0 8 12 12 12h3M17 14l4 4-4 4M3 18h3c1.7 0 3.5-2.3 5-5M14 8c1.5-1.4 2.6-2 4-2h3M17 2l4 4-4 4" /></svg>{t('browse.order.random')}</a></nav>
    <label class="size" title={t('browse.tileSize')}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="6" height="6" rx="1" /></svg><input type="range" min="0" max={TILE_SIZES.length - 1} step="1" value={TILE_SIZES.indexOf(tileSize)} aria-label={t('browse.tileSize')} aria-valuetext="{tileSize}px" oninput={event => sizeTiles(Number(event.currentTarget.value))} /><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5" /></svg></label>
  </div>
  </div>
  <nav class="marks" aria-label={t('field.encodings')}>
    {#each MARKED as registry (registry.id)}
      {@const name = t(`registry.${registry.id}`)}
      <span class="pair" role="group" aria-label={name} title={registry.label}>
        <span class="work" aria-hidden="true">{name}</span>
        <a class="chip" class:on={data.within.includes(registry.id)} aria-current={data.within.includes(registry.id) ? 'true' : undefined} href={withMark(registry.id, 'in')} onclick={event => chipClick(event, toggleMark(data.within, data.without, registry.id, 'in'))}><span class="sr-only">{name}</span>{t('registry.held')} <span class="n">{count(`r:${registry.id}`)}</span></a>
        <a class="chip" class:on={data.without.includes(registry.id)} aria-current={data.without.includes(registry.id) ? 'true' : undefined} href={withMark(registry.id, 'out')} onclick={event => chipClick(event, toggleMark(data.within, data.without, registry.id, 'out'))}><span class="sr-only">{name}</span>{t('registry.absent')} <span class="n">{count(`x:${registry.id}`)}</span></a>
      </span>
    {/each}
  </nav>
  <div class="results stack" aria-busy={filtering || undefined}>
  {#if data.searchError}
    <p class="muted" id="search-error" role="alert">{t(`browse.${data.searchError}`)}</p>
  {:else}
    {#if shown.total}<p class="found">{t('browse.found', { n: `${shown.total.n}${shown.total.floor ? '+' : ''}` })}</p>{/if}
    {#if data.pages && data.records && shown.tiles.length}
      <div class="pager">
        <p class="range">{t('browse.shown', { from: firstShown, to: firstShown + shown.tiles.length - 1, n: `${data.records}${data.recordsFloor ? '+' : ''}` })}</p>
        {#if data.records > PAGE_SIZES[0]}{@render sizes()}{/if}
        {#if data.pages > 1}{@render turner('page')}{/if}
      </div>
    {:else if data.per !== PAGE}
      <div class="pager">{@render sizes()}</div>
    {/if}
    {#if data.also.length}<details class="found also"><summary>{t('browse.alsoSearched', { n: data.also.length })}</summary><ul>{#each data.also as spelling}<li class="ids">{spelling}</li>{/each}</ul></details>{/if}
    {#if shown.tiles.length}
      <div class="tiles" bind:this={grid}>{#each shown.tiles as tile (tile.id)}<Tile {tile} glyph={shown.glyphs[tile.id]} highlighted={returnedEntry === tile.id} />{/each}</div>
    {:else if !shown.partial || done}
      <div class="empty">
        <p>{data.continued ? t('browse.searchSegmentEmpty') : hasFilters ? t('browse.empty') : t('browse.emptyAll')}</p>
        <div class="empty-actions">
          {#if hasFilters}<a class="text-link" href={clearedFilters}>{t('sources.clear')}</a>{/if}
          <a class="text-link" href={href('/new')}>{t('browse.addOne')}</a>
        </div>
      </div>
    {/if}
  {/if}
  </div>
  {#if shown.next !== null && !done}
    <div class="ahead" bind:this={sentinel}>
      {#if shown.partial && shown.total}
        <p class="muted">{t('browse.searched', { n: Math.min(shown.scanned, shown.total.pool), of: shown.total.pool })}</p>
      {:else if shown.partial && mounted && failedFor !== data}
        <p class="muted">{t('browse.searching')}</p>
      {:else if pagesLeft !== null}
        <p class="muted">{t(pagesLeft === 1 && !shown.total?.floor ? 'browse.pageLeft' : 'browse.pagesLeft', { n: `${pagesLeft}${shown.total?.floor ? '+' : ''}` })}</p>
      {/if}
      {#if !shown.partial || !mounted || failedFor === data}
        <a class="button" href={more} aria-busy={busy} onclick={appendOnClick}>{t(shown.partial ? 'browse.continueSearch' : 'browse.more')}</a>
      {/if}
    </div>
  {/if}
  {#if !data.searchError && data.pages && data.pages > 1 && shown.tiles.length}<div class="pager foot">{@render turner('page-foot')}</div>{/if}
</div>
<style>
  /* The list loads on as it scrolls, so its footer is out of reach; the chats sit under the heading. */
  .chats { margin:0; font-size:12.5px; color:var(--muted) }
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .filter-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 16px }
  .filter-foot .hint { margin:0 }
  .glyph-setting { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; min-inline-size:0 }
  .glyph-setting-label { font-size:11px; font-weight:500; color:var(--muted) }
  .intro { gap:8px; max-width:720px }
  .filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid var(--line); border-radius:9px; background:var(--surface) }
  .filters .field { flex:1 1 140px } .filters .search { flex:2 1 220px } .filters .radical { flex:0 1 120px } .filters .decade { flex:1 1 140px }
  .search:has([aria-invalid="true"]) > label { color:var(--wrong) }
  .search-box { position:relative; display:flex; align-items:center }
  .search-box .input.has-clear { padding-inline-end:36px }
  .search-box input[type="search"]::-webkit-search-cancel-button { display:none }
  .clear-input { position:absolute; inset-inline-end:4px; display:inline-flex; align-items:center; justify-content:center; inline-size:32px; block-size:32px; border:0; border-radius:6px; background:none; color:var(--muted); font-size:18px; line-height:1; cursor:pointer }
  .clear-input:hover { color:var(--ink); background:var(--surface-sunken) }
  .filters select.active { border-color:var(--accent) }
  .filter-actions { display:flex; align-items:center; gap:10px; min-block-size:max(42px,var(--target-size)) }
  .clear-filters { display:inline-flex; align-items:center; min-block-size:max(36px,var(--target-size)); padding-inline:4px; color:var(--muted); white-space:nowrap }
  .results { transition:opacity 140ms ease }
  .results[aria-busy="true"] { opacity:.55; transition-delay:120ms }
  @media (prefers-reduced-motion: reduce) { .results { transition:none } }
  .choose { display:flex; align-items:center; justify-content:space-between; gap:8px } .choose:hover { border-color:var(--ink) } .pinned .glyph { font-size:18px; line-height:1 }
  .states, .marks, .sort { display:flex; flex-wrap:wrap; gap:4px }
  .shuffle { display:inline-flex; align-items:center; gap:6px } .shuffle svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round }
  .view { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px }
  .bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px } .marks { gap:8px }
  .pair { display:inline-flex; flex-wrap:wrap; align-items:center; max-inline-size:100%; border:1px solid var(--line); border-radius:8px } .work { padding-inline:12px 4px; font-size:13px; font-weight:500; white-space:nowrap }
  .states .n, .marks .n { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
  .pinned { display:flex; align-items:center; justify-content:space-between; gap:8px; min-block-size:max(42px,var(--target-size)); padding:9px 12px; border:1px solid var(--accent); border-radius:7px; background:var(--accent-light); color:var(--accent); font-weight:500 }
  .bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px }
  .size { display:flex; align-items:center; gap:6px; color:var(--muted) }
  .size svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.4 }
  .size input { width:96px; padding:0; border:0; background:none; accent-color:var(--accent) }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(var(--tile-size),100%),1fr)); gap:22px 16px }
  :global(:root:is([data-tile-size="48"], [data-tile-size="64"], [data-tile-size="80"])) .tiles { gap:8px }
  .pager { display:flex; flex-wrap:wrap; align-items:center; gap:8px 20px; font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums }
  .foot { justify-content:flex-end }
  .sizes { display:flex; flex-wrap:wrap; align-items:center; gap:2px } .sizes span { margin-inline-end:6px } .sizes .chip { justify-content:center; min-inline-size:34px; padding-inline:8px }
  .range { margin:0; margin-inline-end:auto }
  .pages { display:flex; flex-wrap:wrap; align-items:center; gap:2px }
  .pages .chip { justify-content:center; min-inline-size:34px; padding-inline:8px } .pages .off { opacity:.35; cursor:default } .pages .off:hover { color:var(--muted) } .gap { padding-inline:4px }
  .jump { display:flex; align-items:center; gap:6px }
  .jump .input { width:6ch; min-height:0; height:30px; padding:0 4px; font-size:13px; text-align:center }
  .jump .button { min-block-size:0; height:30px; padding:0 12px; font-size:13px }
  .found { margin-bottom:-8px; font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums }
  .also { margin-top:0 }
  .also summary { cursor:pointer; color:var(--muted) }
  .also ul { display:flex; flex-wrap:wrap; gap:4px 12px; margin:6px 0 0; padding:0; list-style:none; overflow-wrap:anywhere }
  .ahead { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px }
  @media (max-width: 38rem) {
    .pages .far { display:none }
    .filters { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr)) }
    .filters .search, .filters .filter-actions { grid-column:1 / -1 }
  }
  .empty { padding:48px 16px; text-align:center; color:var(--muted) }
  .empty-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:16px; margin-top:12px }
  .empty-actions a { color:var(--ink) }
</style>
