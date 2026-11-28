<script lang="ts">
  // Deterministic layered stemma visualization (left-to-right, oldest -> newest):
  // HTML anchor tiles positioned over one SSR SVG edge layer, zero client measurement, works without scripts.
  import EvidenceDate from './EvidenceDate.svelte'
  import type { DateReading } from '$lib/dates'
  import { recordCode } from '$lib/code'
  import { layoutStemma, type StemmaGraph, type StemmaNode } from '$lib/stemma'
  import { href, media, t } from '$lib/t'

  let {
    graph,
    mode = 'strip',
    dates,
    activeSightingId = null,
    legend = false,
  }: {
    graph: StemmaGraph
    mode?: 'strip' | 'full'
    dates?: Map<string, DateReading | null>
    activeSightingId?: number | null
    legend?: boolean
  } = $props()

  const layout = $derived(layoutStemma(graph, mode))
  let hoveredUnit = $state<string | null>(null)

  const lineageSets = $derived.by(() => {
    if (!hoveredUnit) return null
    const anc = new Set(layout.ancestors[hoveredUnit] ?? [])
    const desc = new Set(layout.descendants[hoveredUnit] ?? [])
    const all = new Set([hoveredUnit, ...anc, ...desc])
    return { anc, desc, all }
  })

  function edgeInLineage(fromUnit: string, toUnit: string): boolean {
    if (!lineageSets || !hoveredUnit) return false
    if (fromUnit === hoveredUnit || toUnit === hoveredUnit) return true
    return (lineageSets.anc.has(fromUnit) && lineageSets.anc.has(toUnit))
      || (lineageSets.desc.has(fromUnit) && lineageSets.desc.has(toUnit))
  }

  const nodeById = $derived(new Map(graph.nodes.map(node => [node.id, node])))
  const uid = $props.id()

  function nodeHref(node: StemmaNode): string | null {
    if (node.kind === 'witness' && node.sightingId !== null && node.entryId !== null) {
      return mode === 'strip' && node.entryId === graph.entryId
        ? `#sighting-${node.sightingId}`
        : href(`/${recordCode(node.entryId)}#sighting-${node.sightingId}`)
    }
    if (node.kind === 'unseen' && node.sourceId !== null) return href(`/source/${node.sourceId}`)
    if (node.kind === 'removed' && node.entryId !== null) return href(`/${recordCode(node.entryId)}/history`)
    return null
  }

  function nodeLabel(node: StemmaNode): string {
    return node.title || node.place || (node.sightingId !== null ? `#${node.sightingId}` : t('cite.unnamed'))
  }
</script>

{#snippet tileInner(node: StemmaNode)}
  {@const label = nodeLabel(node)}
  <span class="glyph" class:empty={!node.thumbKey}>
    {#if node.kind === 'unseen'}
      <span class="plus" aria-hidden="true">＋</span>
    {:else if node.thumbKey}
      <img src={media(node.thumbKey)} alt="" loading="lazy" decoding="async" />
    {:else}
      <span class="mark" aria-hidden="true">{node.kind === 'removed' ? '×' : '#'}</span>
    {/if}
  </span>
  <span class="title" title={label}>{label}</span>
  <span class="sub">
    {#if node.date}<span class="year"><EvidenceDate text={node.date} reading={dates?.get(node.date)} linked={false} /></span>{/if}
    {#if node.kind === 'unseen'}
      <span class="tag">{t('cite.unseen')}</span>
    {:else if node.kind === 'removed'}
      <span class="tag">{t('cite.removed')}</span>
    {:else if node.entryId !== null && node.entryId !== graph.entryId}
      <span class="code">{recordCode(node.entryId)}</span>
    {/if}
  </span>
{/snippet}

<div class="stemma" class:full={mode === 'full'} class:strip={mode === 'strip'} role="region" aria-label={t('stemma.region')}>
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
          {@const inLineage = edgeInLineage(edge.fromUnit, edge.toUnit)}
          {@const dimmed = lineageSets !== null && !inLineage}
          {@const marker = inLineage ? `${uid}-arrow-active` : edge.kind === 'derived' ? `${uid}-arrow-derived` : `${uid}-arrow`}
          <path
            d={edge.path}
            class="edge"
            class:derived={edge.kind === 'derived'}
            class:unseen-edge={edge.fromUnseen}
            class:back={edge.backEdge}
            class:related={inLineage}
            class:dim={dimmed}
            marker-end="url(#{marker})"
          />
        {/each}
      </svg>

      {#each layout.units as unit (unit.id)}
        {@const dimmed = lineageSets !== null && !lineageSets.all.has(unit.id)}
        {@const related = lineageSets !== null && lineageSets.all.has(unit.id)}
        {#if unit.kind === 'edition'}
          <div
            class="cluster"
            class:dim={dimmed}
            class:related={related && hoveredUnit !== unit.id}
            class:hovered={hoveredUnit === unit.id}
            style:left="{unit.x}px"
            style:top="{unit.y}px"
            style:width="{unit.width}px"
            style:height="{unit.height}px"
            role="group"
            aria-label={t('cite.kind.edition')}
            onmouseenter={() => hoveredUnit = unit.id}
            onmouseleave={() => { if (hoveredUnit === unit.id) hoveredUnit = null }}
            onfocusin={() => hoveredUnit = unit.id}
            onfocusout={() => { if (hoveredUnit === unit.id) hoveredUnit = null }}
          >
            <span class="cluster-label">{t('cite.kind.edition')}</span>
            <div class="cluster-members">
              {#each unit.members as member (member.id)}
                {@const link = nodeHref(member)}
                {@const current = activeSightingId !== null && member.sightingId === activeSightingId}
                {#if link}
                  <a class="tile member witness" class:current class:cross={member.entryId !== graph.entryId} aria-current={current ? 'location' : undefined} href={link}>
                    {@render tileInner(member)}
                  </a>
                {:else}
                  <div class="tile member witness" class:current>
                    {@render tileInner(member)}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {:else}
          {@const node = unit.members[0]}
          {@const link = nodeHref(node)}
          {@const current = activeSightingId !== null && node.sightingId === activeSightingId}
          {#if link}
            <a
              class="tile single {node.kind}"
              class:current
              class:cross={node.kind === 'witness' && node.entryId !== graph.entryId}
              class:dim={dimmed}
              class:related={related && hoveredUnit !== unit.id}
              class:hovered={hoveredUnit === unit.id}
              style:left="{unit.x}px"
              style:top="{unit.y}px"
              style:width="{unit.width}px"
              style:height="{unit.height}px"
              aria-current={current ? 'location' : undefined}
              href={link}
              onmouseenter={() => hoveredUnit = unit.id}
              onmouseleave={() => { if (hoveredUnit === unit.id) hoveredUnit = null }}
              onfocus={() => hoveredUnit = unit.id}
              onblur={() => { if (hoveredUnit === unit.id) hoveredUnit = null }}
            >
              {@render tileInner(node)}
            </a>
          {:else}
            <div
              class="tile single {node.kind}"
              class:dim={dimmed}
              class:related={related && hoveredUnit !== unit.id}
              class:hovered={hoveredUnit === unit.id}
              style:left="{unit.x}px"
              style:top="{unit.y}px"
              style:width="{unit.width}px"
              style:height="{unit.height}px"
              role="group"
              aria-label={nodeLabel(node)}
              onmouseenter={() => hoveredUnit = unit.id}
              onmouseleave={() => { if (hoveredUnit === unit.id) hoveredUnit = null }}
            >
              {@render tileInner(node)}
            </div>
          {/if}
        {/if}
      {/each}
    </div>
  </div>

  <ul class="sr-only">
    {#each graph.edges as edge, index (index)}
      {@const older = nodeById.get(edge.from)}
      {@const newer = nodeById.get(edge.to)}
      {#if older && newer}
        <li>{nodeLabel(newer)} — {t(`cite.kind.${edge.kind}`)} — {nodeLabel(older)}</li>
      {/if}
    {/each}
  </ul>

  {#if legend}
    <div class="legend" role="group" aria-label={t('stemma.legend')}>
      <span class="leg"><span class="swatch solid" aria-hidden="true"></span>{t('cite.kind.quotes')}</span>
      <span class="leg"><span class="swatch derived" aria-hidden="true"></span>{t('cite.kind.derived')}</span>
      <span class="leg"><span class="swatch frame" aria-hidden="true"></span>{t('cite.kind.edition')}</span>
      <span class="leg"><span class="swatch unseen" aria-hidden="true"></span>{t('cite.unseen')}</span>
    </div>
  {/if}
</div>

<style>
  .stemma { display: flex; flex-direction: column; gap: 10px; min-width: 0 }

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
  .strip .scroller { max-block-size: 420px; overflow: auto }
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
  .edge { fill: none; stroke: var(--line-strong); color: var(--line-strong); stroke-width: 1.75; transition: opacity .15s, stroke .15s }
  .edge.unseen-edge { stroke-dasharray: 3 4 }
  .edge.derived { stroke: var(--uncertain-ink); color: var(--uncertain-ink); stroke-dasharray: 6 4 }
  .edge.back { stroke-dasharray: 2 4; opacity: .7 }
  .edge.related { stroke: var(--accent); color: var(--accent); stroke-width: 2.25; opacity: 1 }
  .edge.dim { opacity: .2 }

  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 7px 6px 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    text-align: center;
    transition: border-color .15s, opacity .15s, box-shadow .15s;
  }
  .tile.single { position: absolute }
  a.tile:hover, a.tile:focus-visible { border-color: var(--accent) }
  .tile.current { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-light) }
  .tile.hovered, .tile.related { border-color: var(--accent) }
  .tile.dim, .cluster.dim { opacity: .32 }
  .tile.unseen { border-style: dashed; background: var(--surface-sunken) }
  .tile.removed { border-style: dotted; opacity: .82 }
  .tile.cross { background: var(--surface-sunken) }

  .glyph {
    flex: none;
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    border-radius: 6px;
    background: var(--surface-tile);
    overflow: hidden;
  }
  .full .glyph { width: 92px; height: 92px }
  .glyph img { width: 100%; height: 100%; object-fit: cover }
  .glyph.empty { border: 1px solid var(--line) }
  .plus { font-size: 20px; color: var(--muted); line-height: 1 }
  .mark { font-size: 16px; color: var(--muted); line-height: 1 }

  .title {
    width: 100%;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .full .title { font-size: 12.5px }

  .sub {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    max-width: 100%;
    font-size: 11px;
    line-height: 1.2;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .year, .tag { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .code {
    flex: none;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--accent-light);
    color: var(--accent);
    font-size: 10.5px;
    white-space: nowrap;
  }

  .cluster {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px 8px;
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    background: var(--surface-sunken);
    transition: border-color .15s, opacity .15s;
  }
  .full .cluster { padding: 8px 10px 10px }
  .cluster.hovered, .cluster.related { border-color: var(--accent) }
  .cluster-label {
    font-size: 10.5px;
    line-height: 1.2;
    color: var(--muted);
    text-align: left;
  }
  .cluster-members { display: flex; align-items: stretch; gap: 8px; flex: 1; min-height: 0 }
  .full .cluster-members { gap: 10px }
  .tile.member { flex: 1 1 0; min-width: 0 }

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
  .swatch.frame { width: 16px; height: 12px; border: 1.5px solid var(--line-strong); border-radius: 3px; background: var(--surface-sunken) }
  .swatch.unseen { width: 16px; height: 12px; border: 1.5px dashed var(--line-strong); border-radius: 3px }

  @media print {
    .scroller, .strip .scroller { max-block-size: none; overflow: visible; mask: none; animation: none }
    .tile.dim, .cluster.dim, .edge.dim { opacity: 1 }
  }
</style>
