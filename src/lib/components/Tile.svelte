<script lang="ts">
  import IdsGlyph from './IdsGlyph.svelte'
  import { href, media, t } from '$lib/t'
  import type { Tile } from '$lib/server/entries'
  import type { SightingType } from '$lib/scripts'

  let { tile, glyph = null }: { tile: Tile; glyph?: string | null } = $props()
  const label = (type: SightingType) => t(`evidence.type.${type}`)
  const shown = $derived(tile.types.slice(0, 1))
  const hidden = $derived(tile.types.length - shown.length)
  const marked = $derived(tile.status === 'encoded' || tile.status === 'unencoded' || tile.status === 'variant')
</script>

<a class="tile" href={href(`/entry/${tile.id}`)}>
  <span class="plate">
    {#if tile.ids}<IdsGlyph ids={tile.ids} path={glyph} />
    {:else if tile.cover_key}<img src={media(tile.cover_key)} alt={t('entry.record', { id: tile.id })} loading="lazy" decoding="async" />
    {:else}<span class="blank"><span class="small">{t('browse.noImage')}</span></span>{/if}
  </span>
  <span class="ids-line">{tile.ids ?? ''}</span>
  {#if tile.types.length || marked}
    <span class="tags">
      {#if marked}<span class="tag state {tile.status}">{t(`browse.${tile.status}`)}</span>{/if}
      {#each shown as type}<span class="tag">{label(type)}</span>{/each}
      {#if hidden > 0}<span class="tag" title={tile.types.map(label).join(' · ')}>+{hidden}</span>{/if}
    </span>
  {/if}
  <span class="meta">
    {#if tile.firstYear}<time datetime={tile.firstYear} title={t(tile.firstYearKind === 'original' ? 'field.originalDate' : 'field.reportDate')}>{tile.firstYear}</time><span aria-hidden="true">·</span>{/if}
    <span class="sightings">{t(tile.sightings === 1 ? 'browse.sighting' : 'browse.sightings', { n: tile.sightings })}</span>
  </span>
</a>

<style>
  .tile { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
  .plate { display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: var(--surface-tile); color: var(--ink); margin-bottom: 4px }
  .tile:hover .plate { outline: 2px solid var(--line-strong); outline-offset: 1px }
  img { width: 100%; height: 100%; object-fit: contain; display: block }
  .blank { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px; color: var(--muted); text-align: center }
  .ids-line { min-height: 17px; font-size: 12px; line-height: 1.35; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0 }
  .tag { max-width: 100%; padding: 0 5px; border-radius: 4px; background: var(--surface-sunken); font-size: 10.5px; line-height: 1.6; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .tag.state { flex: none; background: var(--surface-selected); color: var(--ink); font-weight: 550 }
  .tag.unencoded { background: var(--accent-light); color: var(--accent) }
  .meta { display: flex; align-items: baseline; gap: 5px; min-width: 0; min-height: 18px; font-size: 12px; color: var(--muted) }
  .meta time { flex: none; font-variant-numeric: tabular-nums }
  .sightings { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
</style>
