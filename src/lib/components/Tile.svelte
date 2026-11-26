<script lang="ts">
  import IdsGlyph from './IdsGlyph.svelte'
  import { href, media, t, yearName } from '$lib/t'
  import { recordCode } from '$lib/code'
  import type { Tile } from '$lib/server/entries'
  import type { SightingType } from '$lib/scripts'
  import { MARKED } from '$lib/registries'

  // `to` is where the tile leads when that is not the record's page.
  let { tile, glyph = null, to = null }: { tile: Tile; glyph?: string | null; to?: string | null } = $props()
  const label = (type: SightingType) => t(`evidence.type.${type}`)
  const shown = $derived(tile.types.slice(0, 1))
  const hidden = $derived(tile.types.length - shown.length)
  const works = $derived(MARKED.filter(registry => tile.marks.includes(registry.id)))
</script>

<a class="tile" href={to ?? href(`/entry/${tile.id}`)}>
  <span class="plate">
    {#if tile.ids}<IdsGlyph ids={tile.ids} layout={tile.layout} path={glyph} />
    {:else if tile.cover_key}<img src={media(tile.cover_key)} alt={t('entry.record', { id: recordCode(tile.id) })} loading="lazy" decoding="async" />
    {:else}<span class="blank"><span class="small">{t('browse.noImage')}</span></span>{/if}
  </span>
  <span class="ids-line">{tile.ids ?? ''}</span>
  {#if tile.awaitingReview || tile.types.length || tile.status}
    <span class="tags">
      {#if tile.awaitingReview}<span class="tag state review">{t('review.awaiting')}</span>{/if}
      {#if tile.status}<span class="tag state {tile.status}">{t(`browse.${tile.status}`)}</span>{/if}
      {#each shown as type}<span class="tag">{label(type)}</span>{/each}
      {#if hidden > 0}<span class="tag" title={tile.types.map(label).join(' · ')}>+{hidden}</span>{/if}
    </span>
  {/if}
  {#if works.length}
    <span class="tags works">{#each works as registry (registry.id)}{@const phrase = t('registry.in', { name: t(`registry.${registry.id}`) })}<span class="tag work" title={phrase}><span aria-hidden="true">{registry.mark}</span><span class="sr-only">{phrase}</span></span>{/each}</span>
  {/if}
  <span class="meta">
    {#if tile.firstYear}<svelte:element this={Number(tile.firstYear) > 0 ? 'time' : 'span'} datetime={Number(tile.firstYear) > 0 ? tile.firstYear : undefined} title={t(tile.firstYearKind === 'original' ? 'field.originalDate' : 'field.reportDate')}>{yearName(Number(tile.firstYear))}</svelte:element><span aria-hidden="true">·</span>{/if}
    <span class="sightings">{t(tile.sightings === 1 ? 'browse.sighting' : 'browse.sightings', { n: tile.sightings })}</span>
  </span>
</a>

<style>
  .tile { position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0 }
  .plate { display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; border-radius: 6px; background: var(--surface-tile); color: var(--ink); margin-bottom: 4px }
  .tile:hover .plate { outline: 2px solid var(--line-strong); outline-offset: 1px }
  img { width: 100%; height: 100%; object-fit: contain; display: block }
  .blank { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px; color: var(--muted); text-align: center }
  .ids-line { min-height: 17px; font-size: 12px; line-height: 1.35; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0 }
  .tag { max-width: 100%; padding: 0 5px; border-radius: 4px; background: var(--surface-sunken); font-size: 10.5px; line-height: 1.6; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .tag.state { flex: none; background: var(--surface-selected); color: var(--ink); font-weight: 550 }
  .tag.work { flex: none; background: var(--good-light); color: var(--good) }
  .tag.review { background: var(--uncertain-badge); color: var(--uncertain-ink) }
  .tag.unifiable { background: var(--accent-light); color: var(--accent) }
  .meta { display: flex; align-items: baseline; gap: 5px; min-width: 0; min-height: 18px; font-size: 12px; color: var(--muted) }
  .meta time { flex: none; font-variant-numeric: tabular-nums }
  .sightings { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  /* Tiles below 96px show the glyph alone; the lines under it stay readable to assistive technology. */
  :global(:root:is([data-tile-size="48"], [data-tile-size="64"], [data-tile-size="80"])) :is(.tile > :not(.plate), .blank) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap }
  :global(:root:is([data-tile-size="48"], [data-tile-size="64"], [data-tile-size="80"])) .plate { margin-bottom: 0 }
</style>
