<script lang="ts">
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { COLLECTIONS, groupGenres } from '$lib/genres'
  import { cleanIds } from '$lib/ids'
  import { STATUSES, NEEDS } from '$lib/scripts'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const { standalone, groups } = groupGenres()
  const more = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    params.set('before', String(data.next))
    return `?${params}`
  })
  const count = (key: string) => data.counts?.[key] ?? 0
  // A collection or a tag is chosen by following a link, and stays until it is cleared.
  const pinned = $derived(data.genre ? null : data.collection ? { name: 'collection', value: data.collection, label: COLLECTIONS.find(item => item.slug === data.collection)?.label ?? data.collection } : data.tag ? { name: 'tag', value: data.tag, label: `#${data.tag}` } : null)
  const withFilter = (filter: string) => {
    const params = new URLSearchParams(page.url.searchParams)
    params.delete('before')
    if (filter) params.set('filter', filter); else params.delete('filter')
    return params.size ? `?${params}` : href()
  }
  const without = $derived.by(() => {
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
      <div class="field"><span class="label">{t(pinned.name === 'tag' ? 'field.tags' : 'field.collection')}</span><input type="hidden" name={pinned.name} value={pinned.value} /><a class="pinned" href={without} aria-label="{pinned.label} ×">{pinned.label} <span aria-hidden="true">×</span></a>{#if pinned.value === 'extension-e'}<a class="text-link" href={href('/extension-e')}>{t('extensionE.open')}</a>{/if}</div>
    {:else}
      <div class="field"><label for="genre">{t('field.genre')}</label><select class="input" id="genre" name="genre" value={data.genre ?? ''}>
        <option value="">{t('browse.all')}</option>
        {#each standalone as genre (genre.slug)}<option value={genre.slug}>{genre.label} ({count(`g:${genre.slug}`)})</option>{/each}
        {#each groups as group (group.parent.slug)}<optgroup label={group.parent.label}><option value={group.parent.slug}>{group.parent.label} ({count(`g:${group.parent.slug}`)})</option>{#each group.children as genre (genre.slug)}<option value={genre.slug}>{genre.label} ({count(`g:${genre.slug}`)})</option>{/each}</optgroup>{/each}
      </select></div>
    {/if}
    <button class="button" type="submit">{t('browse.filter')}</button>
  </form>
  <p class="hint" id="search-hint">{t('browse.idsHint')}</p>
  <nav class="states" aria-label={t('field.status')}>
    <a class="chip" class:on={!data.filter} href={withFilter('')}>{t('browse.all')} <span class="n">{count('all')}</span></a>
    {#each STATUSES as status}{#if count(`f:${status}`) || data.filter === status}<a class="chip" class:on={data.filter === status} href={withFilter(status)}>{t(`status.${status}`)} <span class="n">{count(`f:${status}`)}</span></a>{/if}{/each}
  </nav>
  {#if data.searchError}
    <p class="muted" role="alert">{t(`browse.${data.searchError}`)}</p>
  {:else if data.tiles.length}
    <div class="tiles">{#each data.tiles as tile (tile.id)}<Tile {tile} glyph={data.glyphs?.[cleanIds(tile.ids ?? '')]} />{/each}</div>
  {:else if !data.partial}
    <div class="empty"><p>{data.continued ? t('browse.searchSegmentEmpty') : data.query || data.filter || data.genre || data.collection || data.tag ? t('browse.empty') : t('browse.emptyAll')}</p><a class="text-link" href={href('/new')}>{t('browse.addOne')}</a></div>
  {/if}
  {#if data.partial}<p class="muted">{t('browse.searchContinues')}</p>{/if}
  {#if data.next}<div><a class="button" href={more}>{t(data.partial ? 'browse.continueSearch' : 'browse.more')}</a></div>{/if}
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .intro { gap:8px; max-width:720px }
  .filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid var(--line); border-radius:9px; background:var(--surface) }
  .filters .field { flex:1 1 180px } .filters .search { flex:2 1 260px }
  .states { display:flex; flex-wrap:wrap; gap:4px } .states .n { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
  .pinned { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:42px; padding:9px 12px; border:1px solid var(--accent); border-radius:7px; background:var(--accent-light); color:var(--accent); font-weight:500 }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:22px 16px }
  .empty { padding:48px 16px; text-align:center; color:var(--muted) } .empty a { display:inline-block; margin-top:12px; color:var(--ink) }
  @media(max-width:500px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
