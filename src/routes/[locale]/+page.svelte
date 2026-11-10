<script lang="ts">
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { cleanIds } from '$lib/ids'
  import { STATUSES, NEEDS } from '$lib/scripts'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const more = $derived.by(() => {
    const params = new URLSearchParams(page.url.searchParams)
    params.set('before', String(data.next))
    return `?${params}`
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
    <div class="field"><label for="filter">{t('browse.filter')}</label><select class="input" id="filter" name="filter" value={data.filter ?? ''}><option value="">{t('browse.anyStatus')}</option><optgroup label={t('field.status')}>{#each STATUSES as status}<option value={status}>{t(`status.${status}`)} ({data.counts?.[`f:${status}`] ?? 0})</option>{/each}</optgroup><optgroup label={t('browse.needs')}>{#each NEEDS as need}<option value={need}>{t(`needs.${need}`)} ({data.counts?.[`n:${need}`] ?? 0})</option>{/each}</optgroup></select></div>
    <button class="button" type="submit">{t('browse.filter')}</button>
  </form>
  <p class="hint" id="search-hint">{t('browse.idsHint')}</p>
  {#if data.searchError}
    <p class="muted" role="alert">{t(`browse.${data.searchError}`)}</p>
  {:else if data.tiles.length}
    <div class="tiles">{#each data.tiles as tile (tile.id)}<Tile {tile} glyph={data.glyphs?.[cleanIds(tile.ids ?? '')]} />{/each}</div>
  {:else if !data.partial}
    <div class="empty"><p>{data.continued ? t('browse.searchSegmentEmpty') : data.query || data.filter ? t('browse.empty') : t('browse.emptyAll')}</p><a class="text-link" href={href('/new')}>{t('browse.addOne')}</a></div>
  {/if}
  {#if data.partial}<p class="muted">{t('browse.searchContinues')}</p>{/if}
  {#if data.next}<div><a class="button" href={more}>{t(data.partial ? 'browse.continueSearch' : 'browse.more')}</a></div>{/if}
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .intro { gap:8px; max-width:720px }
  .filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:16px; border:1px solid var(--line); border-radius:9px; background:var(--surface) }
  .filters .field { flex:1 1 180px } .filters .search { flex:2 1 260px }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:22px 16px }
  .empty { padding:48px 16px; text-align:center; color:var(--muted) } .empty a { display:inline-block; margin-top:12px; color:var(--ink) }
  @media(max-width:500px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
