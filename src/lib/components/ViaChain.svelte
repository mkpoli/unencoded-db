<script lang="ts">
  // A sighting's chain of go-betweens, nearest the cited work first. Each link carries the whole
  // citation: the title, the author, what it appeared in, the publisher, the date, and a web address and
  // archived copies where there are some. Its name is not said twice.
  import ArchiveLinks from './ArchiveLinks.svelte'
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { href, media, t } from '$lib/t'
  import { pictureAlt, TALL } from '$lib/picture'
  import { sourceByline, sourceName, type NameField } from '$lib/source-name'
  import type { Via as StoredVia, ViaPicture } from '$lib/server/entries'

  type Via = StoredVia & { id?: number }
  // `archives` are the copies web archives keep of each linked source, by source.
  let { vias, label = true, dates, archives, pictures = false, witnesses }: { vias: readonly Via[]; label?: boolean; dates?: Map<string, DateReading | null>; archives?: ReadonlyMap<number, readonly string[]>; pictures?: boolean; witnesses?: ReadonlyMap<number, number> } = $props()
  const meta = (via: Via, fields: readonly NameField[]) => sourceByline(via, fields, t, ['author', 'container', 'source_kind', 'publisher'])
  // As large as fits, so the frame is never wider than the picture; a long screenshot is shown by its top.
  // Many pictures are shown smaller, so a long message does not push the rest of the record away.
  const shown = ({ image_w, image_h }: ViaPicture, count: number) => {
    const high = count > 3 ? 120 : 240
    const ratio = Math.min(image_h / image_w, TALL), width = Math.round(Math.min(image_w, high * 1.5, high / ratio))
    return { width, height: Math.round(width * ratio) }
  }
  const web = (url: string | null) => Boolean(url && /^https?:\/\//i.test(url))
</script>

{#if vias.length}
  <div class="vias">
    {#if label}<span class="label">{t('field.via')}</span>{/if}
    <ul class="chain">
      {#each vias as via, position (position)}
        {@const name = sourceName(via, t)}
        {@const byline = meta(via, name.fields)}
        {@const witnessId = via.id ? witnesses?.get(via.id) : undefined}
        <li class="item">
          {#if position}<span class="arrow" aria-hidden="true">←</span>{/if}
          <div class="node">
            <span class="title">
              {#if via.id}
                <a class="text-link" href={href(`/source/${via.id}`)}>{name.text}</a>
                {#if web(via.url)}{' '}<a class="text-link url" href={via.url} target="_blank" rel="noopener noreferrer" aria-label={t('field.url')}>↗</a>{/if}
              {:else if web(via.url)}
                <a class="text-link" href={via.url} target="_blank" rel="noopener noreferrer">{name.text}</a>
              {:else}
                <span>{name.text}</span>
              {/if}
              {#if witnessId}{' '}<a class="witness-pill" href="#sighting-{witnessId}">{t('cite.foundThroughSighting', { id: witnessId })}</a>{/if}
            </span>
            {#if byline || via.report_date}
              <span class="meta">
                {byline}{#if via.report_date}{#if byline}{' · '}{/if}<EvidenceDate text={via.report_date} reading={dates?.get(via.report_date)} />{/if}
              </span>
            {/if}
            {#if via.id && archives?.get(via.id)}<ArchiveLinks archives={archives.get(via.id)!} compact />{/if}
            {#if via.quote}<blockquote class="quote">{via.quote}</blockquote>{/if}
            {#if pictures && via.pictures?.length}
              <div class="pictures">
                {#each via.pictures as picture, index (`${index}:${picture.image_key}`)}
                  <a href={media(picture.image_key)} target="_blank" rel="noopener"><img src={media(picture.thumb_key)} {...shown(picture, via.pictures.length)} alt={pictureAlt([name.text, via.author], index, via.pictures.length)} loading="lazy" decoding="async" /></a>
                {/each}
              </div>
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
  .pictures img { display: block; max-inline-size: 100%; block-size: auto; object-fit: cover; object-position: top }
  .quote { max-width: 75ch; margin: 4px 0 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere }
  .witness-pill { display: inline-flex; align-items: center; padding: 2px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-sunken); font-size: 12.5px }
  .witness-pill:hover, .witness-pill:focus-visible { border-color: var(--accent); color: var(--accent) }
</style>
