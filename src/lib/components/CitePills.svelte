<script lang="ts">
  // Provenance links on one evidence card: older works this witness quotes/re-sets/derives from,
  // and later witnesses that cite it. Works without scripts; long inbound lists fold past 5.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { recordCode } from '$lib/code'
  import { sourceName } from '$lib/source-name'
  import { href, media, t } from '$lib/t'
  import type { InboundCite, ResolvedCite } from '$lib/server/entries'

  let {
    entryId,
    cites = [],
    citedBy = [],
    dates,
  }: {
    entryId: number
    cites?: readonly ResolvedCite[]
    citedBy?: readonly InboundCite[]
    dates?: Map<string, DateReading | null>
  } = $props()

  const INBOUND_SHOWN = 5
  const shownInbound = $derived(citedBy.slice(0, INBOUND_SHOWN))
  const extraInbound = $derived(citedBy.slice(INBOUND_SHOWN))
  const witnessDate = (target: { original_date: string | null; report_date: string | null }) => target.original_date ?? target.report_date
</script>

{#snippet witnessPill(item: { id: number; entry_id: number; title: string | null; place: string; original_date: string | null; report_date: string | null; thumb_key: string | null })}
  {@const sameEntry = item.entry_id === entryId}
  {@const date = witnessDate(item)}
  <a class="pill witness" href={sameEntry ? `#sighting-${item.id}` : href(`/entry/${item.entry_id}#sighting-${item.id}`)}>
    {#if item.thumb_key}<img class="thumb" src={media(item.thumb_key)} width="20" height="20" alt="" loading="lazy" decoding="async" />{/if}
    <span class="name">{item.title || item.place || `#${item.id}`}</span>
    {#if date}<span class="year"><EvidenceDate text={date} reading={dates?.get(date)} /></span>{/if}
    {#if !sameEntry}<span class="code">{recordCode(item.entry_id)}</span>{/if}
  </a>
{/snippet}

{#if cites.length}
  <div class="provenance">
    <span class="heading">{t('field.cites')}</span>
    <ul class="list">
      {#each cites as cite, index (index)}
        {@const named = cite.title || cite.url || cite.author || cite.publisher || cite.report_date || cite.container ? sourceName(cite, t).text : null}
        <li class="item">
          <div class="line">
            <span class="kind" data-kind={cite.kind}><span aria-hidden="true">←</span><span>{t(`cite.kind.${cite.kind}`)}</span></span>
            {#if cite.status === 'witness' && cite.target}
              {@render witnessPill(cite.target)}
              {#if named && named !== (cite.target.title || cite.target.place)}<span class="as-named">{t('cite.asNamed', { name: named })}</span>{/if}
            {:else if cite.status === 'unseen'}
              {#if cite.source_id}
                <a class="pill unseen" href={href(`/source/${cite.source_id}`)}>
                  <span class="plus" aria-hidden="true">＋</span>
                  <span class="name">{named ?? t('cite.unnamed')}</span>
                  {#if cite.report_date}<span class="year"><EvidenceDate text={cite.report_date} reading={dates?.get(cite.report_date)} /></span>{/if}
                  <span class="tag">{t('cite.unseen')}</span>
                </a>
              {:else}
                <span class="pill unseen">
                  <span class="plus" aria-hidden="true">＋</span>
                  <span class="name">{named ?? t('cite.unnamed')}</span>
                  <span class="tag">{t('cite.unseen')}</span>
                </span>
              {/if}
              <a class="text-link small add-link" href={href(`/entry/${entryId}/sighting/new`)}>{t('cite.addWitness')}</a>
            {:else if cite.status === 'removed' && cite.target}
              <a class="pill removed" href={href(`/entry/${cite.target.entry_id}/history`)}>
                <span class="name">{named || cite.target.place || `#${cite.target.id}`}</span>
                <span class="tag">{t('cite.removed')}</span>
              </a>
            {/if}
          </div>
          {#if cite.quote}<blockquote class="quote">{cite.quote}</blockquote>{/if}
          {#if cite.note}<p class="note">{cite.note}</p>{/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

{#if citedBy.length}
  <div class="provenance inbound">
    <span class="heading"><span aria-hidden="true">→</span><span>{t('cite.citedBy')}</span></span>
    <div class="pills">
      {#each shownInbound as item (`${item.sighting_id}:${item.kind}`)}
        <span class="inbound-item">
          {@render witnessPill({ id: item.sighting_id, entry_id: item.entry_id, title: item.title, place: item.place, original_date: item.original_date, report_date: item.report_date, thumb_key: item.thumb_key })}
          {#if item.kind !== 'quotes'}<span class="subkind">{t(`cite.kind.${item.kind}`)}</span>{/if}
        </span>
      {/each}
      {#if extraInbound.length}
        <details class="more-inbound">
          <summary class="pill more-pill">{t('cite.moreInbound', { count: extraInbound.length })}</summary>
          <div class="pills extra">
            {#each extraInbound as item (`${item.sighting_id}:${item.kind}`)}
              <span class="inbound-item">
                {@render witnessPill({ id: item.sighting_id, entry_id: item.entry_id, title: item.title, place: item.place, original_date: item.original_date, report_date: item.report_date, thumb_key: item.thumb_key })}
                {#if item.kind !== 'quotes'}<span class="subkind">{t(`cite.kind.${item.kind}`)}</span>{/if}
              </span>
            {/each}
          </div>
        </details>
      {/if}
    </div>
  </div>
{/if}

<style>
  .provenance { display: flex; flex-direction: column; gap: 6px; min-width: 0 }
  .heading { display: inline-flex; align-items: baseline; gap: 5px; color: var(--muted); font-size: 12.5px }
  .list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; min-width: 0 }
  .item { display: flex; flex-direction: column; gap: 4px; min-width: 0 }
  .line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; min-width: 0 }
  .kind { display: inline-flex; align-items: baseline; gap: 4px; color: var(--muted); font-size: 12px; white-space: nowrap }
  .kind[data-kind='derived'] { color: var(--uncertain-ink) }
  .pills { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0 }
  .inbound-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100% }
  .subkind { color: var(--muted); font-size: 11.5px; white-space: nowrap }
  .pill { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; min-block-size: 28px; padding: 2px 10px 2px 6px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-sunken); color: var(--ink); font-size: 12.5px; line-height: 1.35 }
  .pill:not(:has(.thumb)):not(:has(.plus)) { padding-inline-start: 10px }
  a.pill:hover, a.pill:focus-visible { border-color: var(--accent); color: var(--accent) }
  .pill.unseen { border-style: dashed; background: transparent }
  .pill.removed { opacity: .8; border-style: dotted }
  .thumb { flex: none; width: 20px; height: 20px; border-radius: 999px; object-fit: cover; background: var(--surface-tile) }
  .plus { flex: none; display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: var(--surface-sunken); color: var(--muted); font-size: 11px; line-height: 1 }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .year, .tag { flex: none; color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums }
  .code { flex: none; padding: 0 5px; border-radius: 4px; background: var(--accent-light); color: var(--accent); font-size: 11px; font-variant-numeric: tabular-nums }
  .as-named { color: var(--muted); font-size: 12px }
  .add-link { white-space: nowrap }
  .quote { max-width: 75ch; margin: 0 0 0 12px; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px }
  .note { max-width: 75ch; margin: 0 0 0 12px; color: var(--muted); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere }
  .more-inbound { display: contents }
  .more-pill { cursor: pointer; list-style: none }
  .more-pill::-webkit-details-marker { display: none }
  .extra { width: 100%; margin-top: 4px }
</style>
