<script lang="ts">
  import { tick } from 'svelte'
  import { afterNavigate, preloadData } from '$app/navigation'
  import { browser } from '$app/environment'
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { COLLECTIONS, groupGenres } from '$lib/genres'
  import { MARKED } from '$lib/registries'
  import { ORDER, SORTS } from '$lib/order'
  import { STATUSES, NEEDS } from '$lib/scripts'
  import { href, t } from '$lib/t'
  import { TILE_SIZE_COOKIE, TILE_SIZES, tileSizeOf } from '$lib/tile-size'
  import type { Snapshot } from './$types'
  let { data } = $props()
  const { standalone, groups } = groupGenres()
  // Further pages are appended as the list nears its end. They belong to the listing they were read for,
  // and a new listing starts again from its own first page.
  type Shown = { for: typeof data; tiles: typeof data.tiles; glyphs: Record<string, string | null>; next: string | null; partial: boolean }
  const fresh = (from: typeof data): Shown => ({ for: from, tiles: from.tiles, glyphs: from.glyphs ?? {}, next: from.next, partial: from.partial })
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
  const more = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    params.set('after', shown.next ?? '')
    return `?${params}`
  })
  async function grow() {
    if (busy || shown.next === null) return
    const from = data, base = shown, target = more
    busyFor = from
    try {
      const result = await preloadData(target)
      if (from !== data) return
      if (result.type !== 'loaded' || result.status !== 200) { failedFor = from; return }
      const next = result.data as typeof data
      // A record already shown is not added twice, whatever the page that brings it again.
      const shownIds = new Set(base.tiles.map(tile => tile.id))
      loaded = { for: from, tiles: [...base.tiles, ...next.tiles.filter(tile => !shownIds.has(tile.id))], glyphs: { ...base.glyphs, ...next.glyphs }, next: next.next, partial: next.partial }
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
  // A search reads the records a window at a time and may find nothing in one, so it continues only when asked.
  $effect(() => { if (near && !busy && failedFor !== data && !shown.partial && shown.next !== null) grow() })
  const appendOnClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    failedFor = null
    grow()
  }
  // Returning to the list brings back the pages read so far; a reload starts again from the first.
  // SvelteKit scrolls before it restores them, so the place is set again once they are drawn. Drawings
  // are asked for again as tiles come into view.
  let arrival = ''
  afterNavigate(navigation => { arrival = navigation.type })
  const reloaded = () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
  export const snapshot: Snapshot<{ tiles: Shown['tiles']; next: string | null; partial: boolean; y: number } | null> = {
    capture: () => loaded?.for === data ? { tiles: loaded.tiles, next: loaded.next, partial: loaded.partial, y: scrollY } : null,
    restore: value => {
      if (!value || (arrival === 'enter' && reloaded())) return
      const { y, ...pages } = value
      loaded = { ...pages, glyphs: data.glyphs ?? {}, for: data }
      tick().then(() => scrollTo(scrollX, y))
    }
  }
  // A new order drops the place and the shuffle's start; shuffling again deals a new start.
  const sorted = (order: string) => {
    const params = new URLSearchParams(page.url.searchParams)
    for (const name of ['after', 'seed']) params.delete(name)
    if (order === ORDER) params.delete('sort'); else params.set('sort', order)
    return params.size ? `?${params}` : href()
  }
  // The reader's tile width, set on the document so the server-drawn list and a moved slider agree.
  // The document holds the width last chosen in this tab; the layout's data holds the one the first page was drawn at.
  let tileSize = $state(tileSizeOf(browser ? document.documentElement.dataset.tileSize : String(page.data.tileSize)))
  function sizeTiles(index: number) {
    tileSize = TILE_SIZES[index] ?? tileSize
    document.cookie = `${TILE_SIZE_COOKIE}=${tileSize};path=/;max-age=31536000;samesite=lax`
    document.documentElement.dataset.tileSize = String(tileSize)
  }
  const count = (key: string) => data.counts?.[key] ?? 0
  // The decades records were first seen in, by century, oldest first.
  const centuries = $derived.by(() => {
    // The chosen decade stays an option when it holds no record now, so the form keeps it.
    const held = Object.keys(data.counts ?? {}).filter(key => key.startsWith('y:')).map(key => Number(key.slice(2)))
    const decades = [...new Set([...held, ...(data.decade ? [Number(data.decade)] : [])])].sort((a, b) => a - b)
    const byCentury = new Map<number, number[]>()
    for (const decade of decades) {
      const century = Math.floor(decade / 100) * 100
      byCentury.set(century, [...(byCentury.get(century) ?? []), decade])
    }
    return [...byCentury]
  })
  // A collection or a tag is chosen by following a link, and stays until it is cleared.
  const pinned = $derived(data.genre ? null : data.collection ? { name: 'collection', value: data.collection, label: COLLECTIONS.find(item => item.slug === data.collection)?.label ?? data.collection } : data.tag ? { name: 'tag', value: data.tag, label: `#${data.tag}` } : null)
  const withFilter = (filter: string) => {
    const params = new URLSearchParams(page.url.searchParams)
    params.delete('after')
    if (filter) params.set('filter', filter); else params.delete('filter')
    return params.size ? `?${params}` : href()
  }
  // A work's two chips: one keeps the list to the records in it, the other to the ones not in it. A chip
  // that is on turns itself off, and turning one on turns the other off.
  const withMark = (id: string, name: 'in' | 'out') => {
    const params = new URLSearchParams(page.url.searchParams)
    const on = params.getAll(name).includes(id)
    const kept = { in: params.getAll('in').filter(item => item !== id), out: params.getAll('out').filter(item => item !== id) }
    if (!on) kept[name].push(id)
    for (const key of ['in', 'out', 'after'] as const) params.delete(key)
    for (const key of ['in', 'out'] as const) for (const item of kept[key]) params.append(key, item)
    return params.size ? `?${params}` : href()
  }
  const unpinned = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    for (const name of ['collection', 'tag', 'after']) params.delete(name)
    return params.size ? `?${params}` : href()
  })
  const unfiled = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    for (const name of ['radical', 'after']) params.delete(name)
    return params.size ? `?${params}` : href()
  })
</script>

<Seo />
<div class="page stack">
  <div class="heading">
    <div class="stack intro"><h1>{t('nav.browse')}</h1><p class="muted">{t('browse.intro')}</p></div>
    <a class="button primary" href={href('/new')}>{t('browse.addOne')}</a>
  </div>
  <form class="filters" method="GET">
    <div class="search field"><label for="q">{t('browse.searchLabel')}</label><input class="input" id="q" name="q" value={data.query ?? ''} placeholder={t('browse.search')} aria-describedby="search-hint" /></div>
    <div class="field"><label for="filter">{t('browse.needs')}</label><select class="input" id="filter" name="filter" value={NEEDS.includes(data.filter as never) ? data.filter : ''}><option value="">{t('browse.all')}</option>{#each NEEDS as need}<option value={need}>{t(`needs.${need}`)} ({count(`n:${need}`)})</option>{/each}</select></div>
    {#if pinned}
      <div class="field"><span class="label">{t(pinned.name === 'tag' ? 'field.tags' : 'field.collection')}</span><input type="hidden" name={pinned.name} value={pinned.value} /><a class="pinned" href={unpinned} aria-label="{pinned.label} ×">{pinned.label} <span aria-hidden="true">×</span></a></div>
    {:else}
      <div class="field"><label for="genre">{t('field.genre')}</label><select class="input" id="genre" name="genre" value={data.genre ?? ''}>
        <option value="">{t('browse.all')}</option>
        {#each standalone as genre (genre.slug)}<option value={genre.slug}>{genre.label} ({count(`g:${genre.slug}`)})</option>{/each}
        {#each groups as group (group.parent.slug)}<optgroup label={group.parent.label}><option value={group.parent.slug}>{group.parent.label} ({count(`g:${group.parent.slug}`)})</option>{#each group.children as genre (genre.slug)}<option value={genre.slug}>{genre.label} ({count(`g:${genre.slug}`)})</option>{/each}</optgroup>{/each}
      </select></div>
    {/if}
    <div class="field decade"><label for="decade">{t('browse.decadeLabel')}</label><select class="input" id="decade" name="decade" value={data.decade ?? ''}>
      <option value="">{t('browse.all')}</option>
      {#each centuries as [century, decades] (century)}<optgroup label="{century}–{century + 99}">{#each decades as decade (decade)}<option value={String(decade)}>{t('browse.decade', { n: decade })} ({count(`y:${decade}`)})</option>{/each}</optgroup>{/each}
    </select></div>
    <div class="field radical"><span class="label" id="radical-label">{t('field.radical')}</span>{#if data.radical}{@const radical = [...data.radical].at(-1)}<input type="hidden" name="radical" value={data.radical} /><a class="pinned" href={unfiled} aria-label="{t('field.radical')} {radical} ×"><span class="glyph">{radical}</span> <span aria-hidden="true">×</span></a>{:else}<a class="input choose" id="radical-choice" href={href('/radicals')} aria-labelledby="radical-label radical-choice">{t('browse.all')}<span aria-hidden="true">›</span></a>{/if}</div>
    {#if data.order !== ORDER}<input type="hidden" name="sort" value={data.order} />{/if}
    {#if data.seed !== null}<input type="hidden" name="seed" value={data.seed} />{/if}
    {#each data.within as id}<input type="hidden" name="in" value={id} />{/each}{#each data.without as id}<input type="hidden" name="out" value={id} />{/each}
    <button class="button" type="submit">{t('browse.filter')}</button>
  </form>
  <p class="hint" id="search-hint">{t('browse.idsHint')}</p>
  <div class="bar">
  <nav class="states" aria-label={t('field.status')}>
    <a class="chip" class:on={!data.filter} href={withFilter('')}>{t('browse.all')} <span class="n">{count('all')}</span></a>
    {#each STATUSES as status}{#if count(`f:${status}`) || data.filter === status}<a class="chip" class:on={data.filter === status} href={withFilter(status)}>{t(`status.${status}`)} <span class="n">{count(`f:${status}`)}</span></a>{/if}{/each}
  </nav>
  <div class="view">
    <nav class="sort" aria-label={t('browse.sort')}>{#each SORTS as order}<a class="chip" class:on={data.order === order} aria-current={data.order === order ? 'true' : undefined} href={sorted(order)} title={order === 'earliest' || order === 'latest' ? t('browse.order.dated') : undefined}>{t(`browse.order.${order}`)}</a>{/each}<a class="chip shuffle" class:on={data.order === 'random'} aria-current={data.order === 'random' ? 'true' : undefined} href={sorted('random')} data-sveltekit-preload-data="off"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h3c4 0 8 12 12 12h3M17 14l4 4-4 4M3 18h3c1.7 0 3.5-2.3 5-5M14 8c1.5-1.4 2.6-2 4-2h3M17 2l4 4-4 4" /></svg>{t('browse.order.random')}</a></nav>
    <label class="size" title={t('browse.tileSize')}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="6" height="6" rx="1" /></svg><input type="range" min="0" max={TILE_SIZES.length - 1} step="1" value={TILE_SIZES.indexOf(tileSize)} aria-label={t('browse.tileSize')} aria-valuetext="{tileSize}px" oninput={event => sizeTiles(Number(event.currentTarget.value))} /><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5" /></svg></label>
  </div>
  </div>
  <nav class="marks" aria-label={t('field.encodings')}>
    {#each MARKED as registry (registry.id)}
      {@const name = t(`registry.${registry.id}`)}
      <span class="pair" role="group" aria-label={name} title={registry.label}>
        <span class="work" aria-hidden="true">{name}</span>
        <a class="chip" class:on={data.within.includes(registry.id)} aria-current={data.within.includes(registry.id) ? 'true' : undefined} href={withMark(registry.id, 'in')}><span class="sr-only">{name}</span>{t('registry.held')} <span class="n">{count(`r:${registry.id}`)}</span></a>
        <a class="chip" class:on={data.without.includes(registry.id)} aria-current={data.without.includes(registry.id) ? 'true' : undefined} href={withMark(registry.id, 'out')}><span class="sr-only">{name}</span>{t('registry.absent')} <span class="n">{count(`x:${registry.id}`)}</span></a>
      </span>
    {/each}
  </nav>
  {#if data.searchError}
    <p class="muted" role="alert">{t(`browse.${data.searchError}`)}</p>
  {:else if shown.tiles.length}
    <div class="tiles">{#each shown.tiles as tile (tile.id)}<Tile {tile} glyph={shown.glyphs[tile.id]} />{/each}</div>
  {:else if !shown.partial}
    <div class="empty"><p>{data.continued ? t('browse.searchSegmentEmpty') : data.query || data.filter || data.genre || data.collection || data.tag || data.radical || data.decade || data.within.length || data.without.length ? t('browse.empty') : t('browse.emptyAll')}</p><a class="text-link" href={href('/new')}>{t('browse.addOne')}</a></div>
  {/if}
  {#if shown.partial}<p class="muted">{t('browse.searchContinues')}</p>{/if}
  {#if shown.next !== null}<div bind:this={sentinel}><a class="button" href={more} aria-busy={busy} onclick={appendOnClick}>{t(shown.partial ? 'browse.continueSearch' : 'browse.more')}</a></div>{/if}
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .intro { gap:8px; max-width:720px }
  .filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid var(--line); border-radius:9px; background:var(--surface) }
  .filters .field { flex:1 1 140px } .filters .search { flex:2 1 220px } .filters .radical { flex:0 1 120px } .filters .decade { flex:1 1 140px }
  .choose { display:flex; align-items:center; justify-content:space-between; gap:8px } .choose:hover { border-color:var(--ink) } .pinned .glyph { font-size:18px; line-height:1 }
  .states, .marks, .sort { display:flex; flex-wrap:wrap; gap:4px }
  .shuffle { display:inline-flex; align-items:center; gap:6px } .shuffle svg { width:15px; height:15px; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round }
  .view { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px }
  .bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px } .marks { gap:8px }
  .pair { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:8px } .work { padding-inline:12px 4px; font-size:13px; font-weight:500; white-space:nowrap }
  .states .n, .marks .n { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
  .pinned { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:42px; padding:9px 12px; border:1px solid var(--accent); border-radius:7px; background:var(--accent-light); color:var(--accent); font-weight:500 }
  .bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px }
  .size { display:flex; align-items:center; gap:6px; color:var(--muted) }
  .size svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.4 }
  .size input { width:96px; padding:0; border:0; background:none; accent-color:var(--accent) }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(var(--tile-size),100%),1fr)); gap:22px 16px }
  :global(:root:is([data-tile-size="48"], [data-tile-size="64"], [data-tile-size="80"])) .tiles { gap:8px }
  .empty { padding:48px 16px; text-align:center; color:var(--muted) } .empty a { display:inline-block; margin-top:12px; color:var(--ink) }
</style>
