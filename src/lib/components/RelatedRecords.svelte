<script lang="ts">
  // The records a record is compared with, one to a row: its glyph, what relates the two, and the
  // pictures of its first sightings, each leading to that sighting on its own page.
  import { recordCode } from '$lib/code'
  import { href, media, t } from '$lib/t'
  import type { RelatedRecord } from '$lib/server/related-records'
  import IdsGlyph from './IdsGlyph.svelte'

  let { records }: { records: RelatedRecord[] } = $props()
</script>

<ul class="related">
  {#each records as { tile, relationships, stated, pictures } (tile.id)}
    <li>
      <a class="record" href={href(`/entry/${tile.id}`)}>
        <span class="plate">
          {#if tile.ids}<IdsGlyph ids={tile.ids} layout={tile.layout} />
          {:else if tile.cover_key}<img src={media(tile.cover_key)} alt="" loading="lazy" decoding="async" />{/if}
        </span>
        <span class="named">
          <span class="code">{recordCode(tile.id)}</span>
          <span class="ids">{tile.ids ?? ''}</span>
          <span class="kinds">{#each relationships as relationship}<span class="badge">{t(`relationship.${relationship}`)}</span>{/each}{#each stated.filter(kind => !relationships.includes(kind)) as relationship}<span class="badge there" title={t('entry.relatedStated', { code: recordCode(tile.id) })}>{t(`relationship.${relationship}`)}</span>{/each}</span>
        </span>
      </a>
      {#if pictures.length}
        <ul class="pictures">
          {#each pictures as picture (picture.sighting)}
            {@const name = picture.title || picture.place}
            <li>
              <a href="{href(`/entry/${tile.id}`)}#sighting-{picture.sighting}" title={name}>
                <img src={media(picture.thumb_key)} alt={name} loading="lazy" decoding="async" />
                <span class="caption"><span class="name">{name}</span>{#if picture.date}<span class="date">{picture.date}</span>{/if}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .related { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none }
  .related > li { display: grid; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); align-items: start; gap: 12px 20px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .record { display: flex; align-items: center; gap: 12px; min-width: 0 }
  .plate { flex: none; display: grid; place-items: center; width: 72px; height: 72px; overflow: hidden; border-radius: 8px; background: var(--surface-tile); color: var(--ink) }
  .plate img { width: 100%; height: 100%; object-fit: contain }
  .named { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0 }
  .code { font-weight: 600; font-variant-numeric: tabular-nums }
  .record:hover .code { color: var(--accent) }
  .ids { max-width: 100%; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px }
  /* Stated on the other record only. */
  .badge.there { border: 1px dashed var(--line-strong); background: none }
  .pictures { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none }
  .pictures a { display: flex; flex-direction: column; gap: 4px; min-width: 0 }
  .pictures img { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 6px; background: var(--surface-sunken) }
  .caption { display: flex; flex-direction: column; min-width: 0; font-size: 12px; line-height: 1.35 }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .date { color: var(--muted); font-variant-numeric: tabular-nums }
  .pictures a:hover .name { color: var(--accent) }
  @media (max-width: 700px) { .related > li { grid-template-columns: minmax(0, 1fr) } }
</style>
