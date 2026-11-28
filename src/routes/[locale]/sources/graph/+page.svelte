<script lang="ts">
  import EvidenceDate from '$lib/components/EvidenceDate.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import SourceGraph from '$lib/components/SourceGraph.svelte'
  import { recordCode } from '$lib/code'
  import { sourceHeading, sourceName } from '$lib/source-name'
  import { href, t } from '$lib/t'

  let { data } = $props()
  const nodeById = $derived(new Map(data.graph.nodes.map(node => [node.id, node])))
  const focusNode = $derived(data.graph.focusId !== null ? nodeById.get(data.graph.focusId) ?? null : null)
  const focusName = $derived(focusNode ? sourceHeading(focusNode, t) : null)
  const title = $derived(focusName ? t('sourceGraph.focusPageTitle', { name: focusName }) : t('sourceGraph.title'))
  const sortedEdges = $derived([...data.graph.edges].sort((a, b) => b.records - a.records || a.from - b.from || a.to - b.to))
</script>

<Seo {title} />

<div class="page stack graph-page">
  <div class="top">
    <div class="row nav-links">
      <a class="text-link back" href={href('/sources')}>← {t('nav.sources')}</a>
      {#if focusNode}
        <a class="text-link" href={href('/sources/graph')}>{t('sourceGraph.showAll')}</a>
        <a class="text-link" href={href(`/source/${focusNode.id}`)}>{t('source.view')}</a>
      {/if}
    </div>
    <div class="row head">
      <h1>{title}</h1>
      <div class="row badges">
        <span class="badge">{t('sourceGraph.works', { count: data.graph.nodes.length })}</span>
        <span class="badge">{t('sourceGraph.links', { count: data.graph.edges.length })}</span>
        {#if data.graph.truncated}
          <span class="badge" title={t('sourceGraph.truncated', data.limits)}>{t(focusNode ? 'sourceGraph.limitFocus' : 'sourceGraph.limit', data.limits)}</span>
        {/if}
      </div>
    </div>
  </div>

  {#if data.pair}
    {@const citingName = sourceHeading(data.pair.citing, t)}
    {@const citedName = sourceHeading(data.pair.cited, t)}
    <section class="panel stack pair-panel" id="pair">
      <div class="row pair-head">
        <h2>
          <a class="text-link" href={href(`/source/${data.pair.citing.id}`)}>{citingName}</a>
          <span class="arrow muted" aria-hidden="true">←</span>
          <a class="text-link" href={href(`/source/${data.pair.cited.id}`)}>{citedName}</a>
        </h2>
        <div class="row badges">
          {#if data.pair.summary}
            <span class="badge">{t(data.pair.summary.records === 1 ? 'source.record' : 'source.records', { n: data.pair.summary.records })}</span>
            {#if data.pair.summary.quotes > 0}<span class="badge">{t('cite.kind.quotes')} · {data.pair.summary.quotes}</span>{/if}
            {#if data.pair.summary.edition > 0}<span class="badge">{t('cite.kind.edition')} · {data.pair.summary.edition}</span>{/if}
            {#if data.pair.summary.derived > 0}<span class="badge">{t('cite.kind.derived')} · {data.pair.summary.derived}</span>{/if}
          {/if}
          {#if data.pair.hasMore}
            <span class="badge">{t('sourceGraph.showingFirst', { count: data.limits.pair })}</span>
          {/if}
          <a class="text-link small" href={href(`/sources/graph?source=${data.pair.cited.id}`)}>{t('sourceGraph.focusCited')}</a>
          <a class="text-link small" href={href('/sources/graph')}>{t('sourceGraph.clearPair')}</a>
        </div>
      </div>

      {#if data.pair.items.length}
        <ul class="pair-list">
          {#each data.pair.items as item (`${item.sighting_id}:${item.position}`)}
            {@const tile = item.tile}
            <li class="pair-item">
              <a class="record" href={href(`/${recordCode(tile.id)}#sighting-${item.sighting_id}`)}>
                <span class="plate">
                  {#if tile.ids}
                    <IdsGlyph ids={tile.ids} layout={tile.layout} path={data.glyphs?.[tile.id]} />
                  {:else}
                    <span class="small muted">{t('browse.noImage')}</span>
                  {/if}
                </span>
                <span class="code">{recordCode(tile.id)}</span>
              </a>
              <div class="stack body">
                <div class="row badges">
                  <span class="badge">{t(`cite.kind.${item.kind}`)}</span>
                  <a class="text-link small" href={href(`/${recordCode(tile.id)}#sighting-${item.sighting_id}`)}>
                    {item.place || `#${item.sighting_id}`}
                  </a>
                  {#if item.original_date}
                    <span class="small muted"><EvidenceDate text={item.original_date} reading={data.dates.get(item.original_date)} /></span>
                  {/if}
                  {#if item.cited_sighting_id && item.cited_entry_id}
                    <span class="muted" aria-hidden="true">←</span>
                    <a class="text-link small" href={href(`/${recordCode(item.cited_entry_id)}#sighting-${item.cited_sighting_id}`)}>
                      {item.cited_place || `#${item.cited_sighting_id}`}{#if item.cited_entry_id !== tile.id}{' '}({recordCode(item.cited_entry_id)}){/if}
                    </a>
                  {/if}
                </div>
                {#if item.quote}<blockquote class="quote">{item.quote}</blockquote>{/if}
                {#if item.note}<p class="note">{item.note}</p>{/if}
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{t('sourceGraph.pairEmpty')}</p>
      {/if}
    </section>
  {/if}

  {#if data.graph.edges.length}
    <section class="panel stack">
      <SourceGraph
        graph={data.graph}
        mode="full"
        dates={data.dates}
        activePair={data.pair ? { citing: data.pair.citing.id, cited: data.pair.cited.id } : null}
        legend
      />
    </section>

    <section class="panel stack">
      <h2>{t('sourceGraph.pairs')}</h2>
      <ul class="edge-table">
        {#each sortedEdges as edge (`${edge.from}->${edge.to}`)}
          {@const older = nodeById.get(edge.from)}
          {@const newer = nodeById.get(edge.to)}
          {#if older && newer}
            <li class="edge-row" class:active={data.pair?.citing.id === edge.to && data.pair?.cited.id === edge.from}>
              <div class="edge-works">
                <a class="text-link" href={href(`/source/${newer.id}`)}>{sourceName(newer, t).text}</a>
                <span class="muted" aria-hidden="true">←</span>
                <a class="text-link" href={href(`/source/${older.id}`)}>{sourceName(older, t).text}</a>
              </div>
              <div class="row edge-meta">
                {#if edge.quotes > 0}<span class="badge">{t('cite.kind.quotes')} · {edge.quotes}</span>{/if}
                {#if edge.edition > 0}<span class="badge">{t('cite.kind.edition')} · {edge.edition}</span>{/if}
                {#if edge.derived > 0}<span class="badge">{t('cite.kind.derived')} · {edge.derived}</span>{/if}
                <a class="button small" href={href(`/sources/graph?citing=${newer.id}&cited=${older.id}`)}>
                  {t(edge.records === 1 ? 'source.record' : 'source.records', { n: edge.records })} →
                </a>
              </div>
            </li>
          {/if}
        {/each}
      </ul>
    </section>
  {:else}
    <section class="panel">
      <p class="muted">{t(focusNode ? 'sourceGraph.emptyFocus' : 'sourceGraph.empty')}</p>
    </section>
  {/if}
</div>

<style>
  .top { display: flex; flex-direction: column; gap: 8px }
  .nav-links { gap: 14px }
  .back { color: var(--muted) }
  .head { justify-content: space-between; align-items: baseline }
  .badges { gap: 6px }
  .panel { padding: 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .pair-head { justify-content: space-between; align-items: baseline; gap: 10px }
  .pair-head h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: 0; font-size: 16px }
  .pair-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none }
  .pair-item { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 14px; align-items: start; padding-top: 12px; border-top: 1px solid var(--line) }
  .pair-item:first-child { padding-top: 0; border-top: 0 }
  .record { display: flex; flex-direction: column; align-items: center; gap: 4px; color: inherit; text-decoration: none; min-width: 0 }
  .plate { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 6px; background: var(--surface-sunken); overflow: hidden }
  .code { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums }
  .body { gap: 6px; min-width: 0 }
  .quote { max-width: 75ch; margin: 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px }
  .note { margin: 0; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12.5px }

  .edge-table { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none }
  .edge-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 10px 4px; border-top: 1px solid var(--line) }
  .edge-row:first-child { border-top: 0; padding-top: 0 }
  .edge-row.active { background: var(--accent-light); border-radius: 6px; padding-inline: 10px }
  .edge-works { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0 }
  .edge-meta { gap: 6px }
  .button.small { min-height: 30px; padding: 3px 10px; font-size: 12px }

  @media (max-width: 700px) {
    .panel { padding: 14px }
    .pair-item { grid-template-columns: 56px minmax(0, 1fr); gap: 10px }
    .plate { width: 52px; height: 52px }
  }
  @media print {
    .nav-links, .edge-meta .button { display: none }
    .panel { border: 0; padding: 0 }
  }
</style>
