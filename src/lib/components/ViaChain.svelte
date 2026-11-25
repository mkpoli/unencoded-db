<script lang="ts">
  // A sighting's chain of go-betweens, nearest the cited work first. Each link carries the whole
  // citation: the title, the author, what it appeared in, the publisher, the date, and a web address where
  // there is one. A source without a title, as a chat message is, goes by what it appeared in.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { href, media, t } from '$lib/t'
  import { pictureAlt } from '$lib/picture'
  import { kindName } from '$lib/source-kind'
  import type { Via as StoredVia, ViaPicture } from '$lib/server/entries'

  type Via = StoredVia & { id?: number }
  let { vias, label = true, dates, pictures = false }: { vias: readonly Via[]; label?: boolean; dates?: Map<string, DateReading | null>; pictures?: boolean } = $props()
  // The container stands as the name of a source without a title, so it is not said twice.
  // The same holds for a personal communication, which often has neither.
  const meta = (via: Via) => [via.author, via.title ? via.container : null, via.title || via.container || via.url ? kindName(via.source_kind) : null, via.publisher].filter(Boolean)
  // As large as fits, so the frame is never wider than the picture.
  const shownWidth = ({ image_w, image_h }: ViaPicture) => Math.max(24, Math.round(Math.min(image_w, 360, 220 * image_w / image_h)))
  const web = (url: string | null) => Boolean(url && /^https?:\/\//i.test(url))
</script>

{#if vias.length}
  <div class="vias">
    {#if label}<span class="label">{t('field.via')}</span>{/if}
    <ul class="chain">
      {#each vias as via, position (position)}
        <li class="item">
          {#if position}<span class="arrow" aria-hidden="true">←</span>{/if}
          <div class="node">
            <span class="title">
              {#if via.id}
                <a class="text-link" href={href(`/source/${via.id}`)}>{via.title || via.container || via.url || kindName(via.source_kind) || t('source.title')}</a>
                {#if web(via.url)} <a class="text-link url" href={via.url} target="_blank" rel="noopener noreferrer" aria-label={t('field.url')}>↗</a>{/if}
              {:else if web(via.url)}
                <a class="text-link" href={via.url} target="_blank" rel="noopener noreferrer">{via.title || via.container || via.url}</a>
              {:else}
                <span>{via.title || via.container || kindName(via.source_kind) || t('source.title')}</span>
              {/if}
            </span>
            {#if meta(via).length || via.report_date}
              <span class="meta">
                {meta(via).join(' · ')}{#if via.report_date}{#if meta(via).length}{' · '}{/if}<EvidenceDate text={via.report_date} reading={dates?.get(via.report_date)} />{/if}
              </span>
            {/if}
            {#if via.quote}<blockquote class="quote">{via.quote}</blockquote>{/if}
            {#if pictures && via.pictures?.length}
              <span class="pictures">
                {#each via.pictures as picture, index (picture.image_key)}
                  <a href={media(picture.image_key)} target="_blank" rel="noopener"><img src={media(picture.thumb_key)} width={shownWidth(picture)} alt={pictureAlt([via.title || via.container || via.url || t('source.title'), via.author], index, via.pictures.length)} loading="lazy" decoding="async" /></a>
                {/each}
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .vias { display: flex; flex-direction: column; gap: 3px; margin: 0; min-width: 0 }
  .label { color: var(--muted) }
  .chain { display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 0; list-style: none; min-width: 0 }
  .item { display: flex; align-items: baseline; gap: 8px; min-width: 0 }
  .arrow { flex: none; color: var(--muted) }
  .node { min-width: 0; overflow-wrap: anywhere; line-height: 1.55 }
  .meta { display: block; margin-top: 1px; color: var(--muted); font-size: 12.5px }
  .url { overflow-wrap: anywhere }
  .pictures { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 6px }
  .pictures a { display: block; max-inline-size: 100%; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-sunken); overflow: hidden }
  .pictures a:hover { border-color: var(--line-strong) }
  .pictures img { display: block; block-size: auto; max-inline-size: 100% }
  .quote { max-width: 75ch; margin: 4px 0 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere }
</style>
