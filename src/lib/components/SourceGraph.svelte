<script lang="ts">
  // Deterministic SSR work-to-work (dictionary / source) quotation graph (left-to-right, oldest -> newest):
  // HTML work tiles and clickable quotation-count badges positioned over one SSR SVG edge layer.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { layoutSourceGraph, type SourceGraphData, type SourceGraphNode } from '$lib/source-graph'
  import { sourceName } from '$lib/source-name'
  import { href, t } from '$lib/t'

  let {
    graph,
    mode = 'full',
    dates,
    activePair = null,
    legend = false,
  }: {
    graph: SourceGraphData
    mode?: 'strip' | 'full'
    dates?: Map<string, DateReading | null>
    activePair?: { citing: number; cited: number } | null
    legend?: boolean
  } = $props()

  const layout = $derived(layoutSourceGraph(graph, mode))
  let hoveredNode = $state<number | null>(null)
  let hoveredEdge = $state<string | null>(null)
  const uid = $props.id()

  const nodeById = $derived(new Map(graph.nodes.map(node => [node.id, node])))
  const activeEdgeKey = $derived(activePair ? `${activePair.cited}->${activePair.citing}` : null)

  const lineageSets = $derived.by(() => {
    if (hoveredNode !== null) {
      const anc = new Set(layout.ancestors[hoveredNode] ?? [])
      const desc = new Set(layout.descendants[hoveredNode] ?? [])
      const all = new Set([hoveredNode, ...anc, ...desc])
      return { anc, desc, all }
    }
    if (hoveredEdge !== null) {
      const edge = layout.edges.find(item => item.key === hoveredEdge)
      if (edge) {
        return { anc: new Set([edge.from]), desc: new Set([edge.to]), all: new Set([edge.from, edge.to]) }
      }
    }
    return null
  })

  function edgeHighlighted(from: number, to: number, key: string): boolean {
    if (hoveredEdge !== null) return hoveredEdge === key
    if (hoveredNode !== null && lineageSets) {
      if (from === hoveredNode || to === hoveredNode) return true
      return (lineageSets.anc.has(from) && lineageSets.anc.has(to))
        || (lineageSets.desc.has(from) && lineageSets.desc.has(to))
    }
    return activeEdgeKey === key
  }

  function labelFor(node: SourceGraphNode): string {
    return sourceName(node, t).text
  }

  function pairHref(citingId: number, citedId: number): string {
    return href(`/sources/graph?from=${citingId}&to=${citedId}`)
  }
</script>

<div class="source-graph" class:full={mode === 'full'} class:strip={mode === 'strip'} role="region" aria-label={t('sourceGraph.region')}>
  <div class="scroller">
    <div class="canvas" style:width="{layout.width}px" style:height="{layout.height}px">
      <svg class="edges" viewBox="0 0 {layout.width} {layout.height}" width={layout.width} height={layout.height} aria-hidden="true">
        <defs>
          <marker id="{uid}-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--line-strong)" />
          </marker>
          <marker id="{uid}-arrow-derived" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--uncertain-ink)" />
          </marker>
          <marker id="{uid}-arrow-active" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--accent)" />
          </marker>
        </defs>
        {#each layout.edges as edge (edge.key)}
          {@const hot = edgeHighlighted(edge.from, edge.to, edge.key)}
          {@const dimmed = lineageSets !== null && !hot}
          {@const marker = hot ? `${uid}-arrow-active` : edge.derivedOnly ? `${uid}-arrow-derived` : `${uid}-arrow`}
          <path
            d={edge.path}
            class="edge"
            class:derived={edge.derivedOnly}
            class:back={edge.backEdge}
            class:related={hot}
            class:dim={dimmed}
            style:stroke-width={hot ? Math.max(2.4, edge.strokeWidth + 0.5) : edge.strokeWidth}
            marker-end="url(#{marker})"
          />
        {/each}
      </svg>

      {#each layout.edges as edge (edge.key)}
        {@const hot = edgeHighlighted(edge.from, edge.to, edge.key)}
        {@const dimmed = lineageSets !== null && !hot}
        {@const older = nodeById.get(edge.from)}
        {@const newer = nodeById.get(edge.to)}
        {#if older && newer}
          <a
            class="edge-badge"
            class:related={hot}
            class:dim={dimmed}
            class:active={activeEdgeKey === edge.key}
            style:left="{edge.labelX}px"
            style:top="{edge.labelY}px"
            href={pairHref(edge.to, edge.from)}
            title={t('sourceGraph.pairAria', { citing: labelFor(newer), cited: labelFor(older), count: edge.records })}
            aria-label={t('sourceGraph.pairAria', { citing: labelFor(newer), cited: labelFor(older), count: edge.records })}
            onmouseenter={() => hoveredEdge = edge.key}
            onmouseleave={() => { if (hoveredEdge === edge.key) hoveredEdge = null }}
            onfocus={() => hoveredEdge = edge.key}
            onblur={() => { if (hoveredEdge === edge.key) hoveredEdge = null }}
          >
            {edge.records}
          </a>
        {/if}
      {/each}

      {#each layout.units as unit (unit.id)}
        {@const node = unit.node}
        {@const title = labelFor(node)}
        {@const isFocus = graph.focusId === node.id}
        {@const dimmed = lineageSets !== null && !lineageSets.all.has(node.id)}
        {@const related = lineageSets !== null && lineageSets.all.has(node.id) && hoveredNode !== node.id}
        <div
          class="tile"
          role="group"
          aria-label={title}
          class:focus={isFocus}
          class:dim={dimmed}
          class:related
          class:hovered={hoveredNode === node.id}
          style:left="{unit.x}px"
          style:top="{unit.y}px"
          style:width="{unit.width}px"
          style:height="{unit.height}px"
          onmouseenter={() => hoveredNode = node.id}
          onmouseleave={() => { if (hoveredNode === node.id) hoveredNode = null }}
          onfocusin={() => hoveredNode = node.id}
          onfocusout={() => { if (hoveredNode === node.id) hoveredNode = null }}
        >
          <a class="tile-main" href={href(`/source/${node.id}`)} aria-current={isFocus ? 'location' : undefined}>
            <span class="title" {title}>{title}</span>
            <span class="sub">
              {#if node.report_date}
                <span class="year"><EvidenceDate text={node.report_date} reading={dates?.get(node.report_date)} linked={false} /></span>
              {/if}
              {#if node.records > 0}
                <span class="count">{t(node.records === 1 ? 'source.record' : 'source.records', { n: node.records })}</span>
              {/if}
            </span>
          </a>
          {#if mode === 'full' && !isFocus}
            <a class="focus-action" href={href(`/sources/graph?source=${node.id}`)} title={t('sourceGraph.focusTitle', { name: title })} aria-label={t('sourceGraph.focusTitle', { name: title })}>
              {t('sourceGraph.focus')}
            </a>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <ul class="sr-only">
    {#each graph.edges as edge (`${edge.from}->${edge.to}`)}
      {@const older = nodeById.get(edge.from)}
      {@const newer = nodeById.get(edge.to)}
      {#if older && newer}
        <li>{t('sourceGraph.pairAria', { citing: labelFor(newer), cited: labelFor(older), count: edge.records })}</li>
      {/if}
    {/each}
  </ul>

  {#if legend}
    <div class="legend" role="group" aria-label={t('sourceGraph.legend')}>
      <span class="leg"><span class="swatch solid" aria-hidden="true"></span>{t('sourceGraph.legendQuotes')}</span>
      <span class="leg"><span class="swatch derived" aria-hidden="true"></span>{t('cite.kind.derived')}</span>
      <span class="leg"><span class="swatch count-sample" aria-hidden="true">3</span>{t('sourceGraph.legendCount')}</span>
    </div>
  {/if}
</div>

<style>
  .source-graph { display: flex; flex-direction: column; gap: 10px; min-width: 0 }

  .scroller {
    overflow-x: auto;
    overflow-y: hidden;
    --fade-size: 2rem;
    --fade-dir: right;
    --fade-start-pos: 0;
    --fade-end-pos: 100%;
    scroll-padding-inline: var(--fade-size);
    mask:
      linear-gradient(black, black) no-clip subtract,
      linear-gradient(to var(--fade-dir), black, transparent) var(--fade-start-pos) 0 / var(--stemma-fade-start) 100% no-repeat no-clip,
      linear-gradient(to var(--fade-dir), transparent, black) var(--fade-end-pos) 0 / var(--stemma-fade-end) 100% no-repeat no-clip;
    animation: stemma-fade-start auto linear both, stemma-fade-end auto linear both;
    animation-duration: auto;
    animation-timeline: scroll(self inline);
    animation-range: 0px var(--fade-size), calc(100% - var(--fade-size)) 100%;
  }
  .strip .scroller { max-block-size: 360px; overflow: auto }
  .scroller:dir(rtl) { --fade-dir: left; --fade-start-pos: 100%; --fade-end-pos: 0 }
  @keyframes stemma-fade-start {
    from { --stemma-fade-start: 0px }
    to { --stemma-fade-start: var(--fade-size) }
  }
  @keyframes stemma-fade-end {
    from { --stemma-fade-end: var(--fade-size) }
    to { --stemma-fade-end: 0px }
  }

  .canvas { position: relative; flex: none }
  .edges { position: absolute; inset: 0; pointer-events: none; overflow: visible }
  .edge { fill: none; stroke: var(--line-strong); transition: opacity .15s, stroke .15s }
  .edge.derived { stroke: var(--uncertain-ink); stroke-dasharray: 6 4 }
  .edge.back { stroke-dasharray: 2 4; opacity: .7 }
  .edge.related { stroke: var(--accent); opacity: 1 }
  .edge.dim { opacity: .18 }

  .edge-badge {
    position: absolute;
    transform: translate(-50%, -50%);
    min-inline-size: 22px;
    padding: 1px 6px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    text-align: center;
    font-variant-numeric: tabular-nums;
    transition: border-color .15s, background-color .15s, color .15s, opacity .15s;
    z-index: 2;
  }
  .edge-badge:hover, .edge-badge:focus-visible, .edge-badge.related, .edge-badge.active {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--surface);
  }
  .edge-badge.dim { opacity: .22 }

  .tile {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    transition: border-color .15s, opacity .15s, box-shadow .15s;
    z-index: 1;
  }
  .tile.focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-light) }
  .tile.hovered, .tile.related { border-color: var(--accent) }
  .tile.dim { opacity: .3 }

  .tile-main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    flex: 1 1 auto;
    min-height: 0;
    padding: 8px 10px 6px;
    color: var(--ink);
    text-decoration: none;
  }
  .tile-main:hover .title, .tile-main:focus-visible .title { color: var(--accent) }

  .title {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .strip .title { font-size: 12.5px; -webkit-line-clamp: 2; line-clamp: 2 }

  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .year, .count { white-space: nowrap }

  .focus-action {
    align-self: flex-end;
    padding: 0 8px 5px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--muted);
    text-decoration: none;
  }
  .focus-action:hover, .focus-action:focus-visible { color: var(--accent); text-decoration: underline }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: 12px;
    color: var(--muted);
  }
  .leg { display: inline-flex; align-items: center; gap: 6px }
  .swatch { display: inline-block; width: 20px; height: 0; border-top: 2px solid var(--line-strong) }
  .swatch.derived { border-top-style: dashed; border-top-color: var(--uncertain-ink) }
  .swatch.count-sample {
    width: auto;
    height: auto;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 0 5px;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
  }

  @media print {
    .scroller, .strip .scroller { max-block-size: none; overflow: visible; mask: none; animation: none }
    .tile.dim, .edge.dim, .edge-badge.dim { opacity: 1 }
    .focus-action { display: none }
  }
</style>
