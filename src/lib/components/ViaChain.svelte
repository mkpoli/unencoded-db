<script lang="ts">
  // A sighting's chain of go-betweens, nearest the cited work first. Each link carries the whole
  // citation: the title, the author, the publisher, the date, and a web address where there is one.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { href, t } from '$lib/t'
  import type { Citation } from '$lib/server/entries'

  type Via = Citation & { id?: number }
  let { vias, label = true, dates }: { vias: readonly Via[]; label?: boolean; dates?: Map<string, DateReading | null> } = $props()
  const web = (url: string | null) => Boolean(url && /^https?:\/\//i.test(url))
</script>

{#if vias.length}
  <div class="vias">
    {#if label}<span class="label">{t('field.via')}</span>{/if}
    <ul class="chain">
      {#each vias as via, position (position)}
        <li class="item">
          {#if position}<span class="arrow" aria-hidden="true">←</span>{/if}
          <span class="node">
            <span class="title">
              {#if via.id}
                <a class="text-link" href={href(`/source/${via.id}`)}>{via.title || via.url || t('source.title')}</a>
                {#if web(via.url)} <a class="text-link url" href={via.url} target="_blank" rel="noopener noreferrer" aria-label={t('field.url')}>↗</a>{/if}
              {:else if web(via.url)}
                <a class="text-link" href={via.url} target="_blank" rel="noopener noreferrer">{via.title || via.url}</a>
              {:else}
                <span>{via.title || t('source.title')}</span>
              {/if}
            </span>
            {#if via.author || via.publisher || via.report_date}
              <span class="meta">
                {#if via.author}{via.author}{/if}
                {#if via.publisher}{#if via.author} · {/if}{via.publisher}{/if}
                {#if via.report_date}{#if via.author || via.publisher} · {/if}<EvidenceDate text={via.report_date} reading={dates?.get(via.report_date)} />{/if}
              </span>
            {/if}
          </span>
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
</style>
