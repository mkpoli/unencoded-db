<script lang="ts">
  // A sighting's chain of go-betweens, nearest the cited work first. Each link carries the whole
  // citation: the title, the author, what it appeared in, the publisher, the date, and a web address where
  // there is one. Its name is not said twice.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { href, t } from '$lib/t'
  import { sourceByline, sourceName, type NameField } from '$lib/source-name'
  import type { Via as StoredVia } from '$lib/server/entries'

  type Via = StoredVia & { id?: number }
  let { vias, label = true, dates }: { vias: readonly Via[]; label?: boolean; dates?: Map<string, DateReading | null> } = $props()
  const meta = (via: Via, fields: readonly NameField[]) => sourceByline(via, fields, t, ['author', 'container', 'source_kind', 'publisher'])
  const web = (url: string | null) => Boolean(url && /^https?:\/\//i.test(url))
</script>

{#if vias.length}
  <div class="vias">
    {#if label}<span class="label">{t('field.via')}</span>{/if}
    <ul class="chain">
      {#each vias as via, position (position)}
        {@const name = sourceName(via, t)}
        {@const byline = meta(via, name.fields)}
        {@const date = name.fields.includes('report_date') ? null : via.report_date}
        <li class="item">
          {#if position}<span class="arrow" aria-hidden="true">←</span>{/if}
          <div class="node">
            <span class="title">
              {#if via.id}
                <a class="text-link" href={href(`/source/${via.id}`)}>{name.text}</a>
                {#if web(via.url)} <a class="text-link url" href={via.url} target="_blank" rel="noopener noreferrer" aria-label={t('field.url')}>↗</a>{/if}
              {:else if web(via.url)}
                <a class="text-link" href={via.url} target="_blank" rel="noopener noreferrer">{name.text}</a>
              {:else}
                <span>{name.text}</span>
              {/if}
            </span>
            {#if byline || date}
              <span class="meta">
                {byline}{#if date}{#if byline}{' · '}{/if}<EvidenceDate text={date} reading={dates?.get(date)} />{/if}
              </span>
            {/if}
            {#if via.quote}<blockquote class="quote">{via.quote}</blockquote>{/if}
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
  .quote { max-width: 75ch; margin: 4px 0 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere }
</style>
