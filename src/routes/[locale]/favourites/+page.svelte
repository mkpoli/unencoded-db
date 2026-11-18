<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { favouritesReady, isFavourite } from '$lib/favourites.svelte'
  import type { Tile as TileItem } from '$lib/server/entries'
  import { t } from '$lib/t'

  let { data } = $props()

  type Shown = { for: typeof data; items: TileItem[]; glyphs: Record<string, string | null>; total: number; next: number | null }
  const fresh = (from: typeof data): Shown => ({
    for: from,
    items: from.tiles,
    glyphs: from.glyphs ?? {},
    total: from.total,
    next: from.next,
  })
  let loaded = $state.raw<Shown | null>(null)
  const shownState = $derived(loaded?.for === data ? loaded : fresh(data))
  let loading = $state(false)
  let error = $state('')

  // A record unstarred elsewhere in this session leaves the page immediately.
  const shown = $derived(favouritesReady() ? shownState.items.filter(item => isFavourite(item.id)) : shownState.items)
  const shownCount = $derived(shown.length + Math.max(0, shownState.total - shownState.items.length))

  async function loadMore() {
    if (loading || shownState.next === null) return
    const from = data, base = shownState
    loading = true
    error = ''
    try {
      const response = await fetch('/api/favourites/entries?' + new URLSearchParams({ offset: String(base.next), limit: '60' }))
      if (!response.ok) throw new Error(response.statusText)
      const page = await response.json() as { tiles: TileItem[]; glyphs?: Record<string, string | null>; total: number; next: number | null }
      if (from !== data) return
      const seen = new Set(base.items.map(item => item.id))
      loaded = {
        for: from,
        items: [...base.items, ...page.tiles.filter(tile => !seen.has(tile.id))],
        glyphs: { ...base.glyphs, ...(page.glyphs ?? {}) },
        total: page.total,
        next: page.next,
      }
    } catch (failure) {
      if (from === data) error = failure instanceof Error && failure.message ? failure.message : t('error.title')
    } finally {
      loading = false
    }
  }
</script>

<Seo title={t('favourites.title')} />

<div class="page stack favourites">
  <header class="head">
    <h1>{t('favourites.title')}</h1>
    {#if shownState.total}
      <p class="muted count-meta">{t(shownCount === 1 ? 'favourites.count.one' : 'favourites.count.other', { count: shownCount })}</p>
    {/if}
  </header>
  {#if error}
    <p class="notice bad" role="alert">{error}</p>
  {/if}
  {#if !shown.length}
    <div class="empty">
      <span class="empty-mark" aria-hidden="true">☆</span>
      <h2>{t('favourites.empty')}</h2>
      <p class="hint">{t('favourites.hint')}</p>
    </div>
  {:else}
    <div class="tiles" aria-label={t('favourites.title')}>
      {#each shown as tile (tile.id)}
        <Tile {tile} glyph={shownState.glyphs[tile.id]} />
      {/each}
    </div>
    {#if shownState.next !== null}
      <div class="more">
        <button class="button" type="button" disabled={loading} onclick={loadMore}>{t('favourites.more')}</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 16px }
  .count-meta { font-size: 13px; font-variant-numeric: tabular-nums }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--tile-size), 100%), 1fr)); gap: 22px 16px }
  :global(:root:is([data-tile-size="48"], [data-tile-size="64"], [data-tile-size="80"])) .tiles { gap: 8px }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 56px 16px; text-align: center; color: var(--muted) }
  .empty h2 { color: var(--ink) }
  .empty-mark { font-size: 28px; line-height: 1; opacity: .7 }
  .more { display: flex; justify-content: flex-start }
</style>
