<script lang="ts">
  import { tick } from 'svelte'
  import { preloadData } from '$app/navigation'
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { COLLECTIONS, groupGenres } from '$lib/genres'
  import { cleanIds } from '$lib/ids'
  import { MARKED } from '$lib/registries'
  import { STATUSES, NEEDS } from '$lib/scripts'
  import { href, t } from '$lib/t'
  import type { Snapshot } from './$types'
  let { data } = $props()
  const { standalone, groups } = groupGenres()
  // Further pages are appended as the list nears its end. They belong to the listing they were read for,
  // and a new listing starts again from its own first page.
  type Shown = { for: typeof data; tiles: typeof data.tiles; glyphs: Record<string, string | null>; next: number | null; partial: boolean }
  const fresh = (from: typeof data): Shown => ({ for: from, tiles: from.tiles, glyphs: from.glyphs ?? {}, next: from.next, partial: from.partial })
  let loaded = $state.raw<Shown | null>(null)
  const shown = $derived(loaded?.for === data ? loaded : fresh(data))
  let sentinel = $state<HTMLElement>()
  let near = $state(false), busy = $state(false), failed = $state(false)
  const more = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    params.set('before', String(shown.next))
    return `?${params}`
  })
  async function grow() {
    if (busy || shown.next === null) return
    const from = data, base = shown, target = more
    busy = true
    try {
      const result = await preloadData(target)
      if (result.type !== 'loaded' || result.status !== 200) throw new Error(String(result.type))
      if (from !== data) return
      const next = result.data as typeof data
      loaded = { for: from, tiles: [...base.tiles, ...next.tiles], glyphs: { ...base.glyphs, ...next.glyphs }, next: next.next, partial: next.partial }
      failed = false
    } catch {
      failed = true
    } finally {
      busy = false
    }
  }
  $effect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => { near = entry.isIntersecting }, { rootMargin: '0px 0px 1200px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  })
  // A search reads the records a window at a time and may find nothing in one, so it continues only when asked.
  $effect(() => { if (near && !busy && !failed && !shown.partial && shown.next !== null) grow() })
  // Returning to the list brings back the pages read so far. SvelteKit scrolls before it restores them,
  // so the place is set again once they are drawn.
  export const snapshot: Snapshot<(Omit<Shown, 'for'> & { y: number }) | null> = {
    capture: () => loaded?.for === data ? { tiles: loaded.tiles, glyphs: loaded.glyphs, next: loaded.next, partial: loaded.partial, y: scrollY } : null,
    restore: value => {
      if (!value) return
      const { y, ...pages } = value
      loaded = { ...pages, for: data }
      tick().then(() => scrollTo(scrollX, y))
    }
  }
  const count = (key: string) => data.counts?.[key] ?? 0
  // A collection or a tag is chosen by following a link, and stays until it is cleared.
  const pinned = $derived(data.genre ? null : data.collection ? { name: 'collection', value: data.collection, label: COLLECTIONS.find(item => item.slug === data.collection)?.label ?? data.collection } : data.tag ? { name: 'tag', value: data.tag, label: `#${data.tag}` } : null)
  const withFilter = (filter: string) => {
    const params = new URLSearchParams(page.url.searchParams)
    params.delete('before')
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
    for (const key of ['in', 'out', 'before'] as const) params.delete(key)
    for (const key of ['in', 'out'] as const) for (const item of kept[key]) params.append(key, item)
    return params.size ? `?${params}` : href()
  }
  const unpinned = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    for (const name of ['collection', 'tag', 'before']) params.delete(name)
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
    {#each data.within as id}<input type="hidden" name="in" value={id} />{/each}{#each data.without as id}<input type="hidden" name="out" value={id} />{/each}
    <button class="button" type="submit">{t('browse.filter')}</button>
  </form>
  <p class="hint" id="search-hint">{t('browse.idsHint')}</p>
  <nav class="states" aria-label={t('field.status')}>
    <a class="chip" class:on={!data.filter} href={withFilter('')}>{t('browse.all')} <span class="n">{count('all')}</span></a>
    {#each STATUSES as status}{#if count(`f:${status}`) || data.filter === status}<a class="chip" class:on={data.filter === status} href={withFilter(status)}>{t(`status.${status}`)} <span class="n">{count(`f:${status}`)}</span></a>{/if}{/each}
  </nav>
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
    <div class="tiles">{#each shown.tiles as tile (tile.id)}<Tile {tile} glyph={shown.glyphs[cleanIds(tile.ids ?? '')]} />{/each}</div>
  {:else if !shown.partial}
    <div class="empty"><p>{data.continued ? t('browse.searchSegmentEmpty') : data.query || data.filter || data.genre || data.collection || data.tag || data.within.length || data.without.length ? t('browse.empty') : t('browse.emptyAll')}</p><a class="text-link" href={href('/new')}>{t('browse.addOne')}</a></div>
  {/if}
  {#if shown.partial}<p class="muted">{t('browse.searchContinues')}</p>{/if}
  {#if shown.next !== null}<div bind:this={sentinel}><a class="button" href={more} aria-busy={busy} onclick={event => { event.preventDefault(); failed = false; grow() }}>{t(shown.partial ? 'browse.continueSearch' : 'browse.more')}</a></div>{/if}
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .intro { gap:8px; max-width:720px }
  .filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid var(--line); border-radius:9px; background:var(--surface) }
  .filters .field { flex:1 1 180px } .filters .search { flex:2 1 260px }
  .states, .marks { display:flex; flex-wrap:wrap; gap:4px } .marks { gap:8px }
  .pair { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:8px } .work { padding-inline:12px 4px; font-size:13px; font-weight:500; white-space:nowrap }
  .states .n, .marks .n { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
  .pinned { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:42px; padding:9px 12px; border:1px solid var(--accent); border-radius:7px; background:var(--accent-light); color:var(--accent); font-weight:500 }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:22px 16px }
  .empty { padding:48px 16px; text-align:center; color:var(--muted) } .empty a { display:inline-block; margin-top:12px; color:var(--ink) }
  @media(max-width:500px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
