<script lang="ts">
  // Interactive donut chart and paired legend table for a component's function breakdown.
  // Clicking any slice or legend row filters `/part/<part>` to that function; clicking the active
  // one clears the filter. Both the SVG and the legend carry full accessible labels and contrast.
  import type { FunctionSlice } from '$lib/server/parts'
  import { t } from '$lib/t'

  let {
    part,
    slices,
    total,
    selected = null,
    hrefFor,
  }: {
    part: string
    slices: readonly FunctionSlice[]
    total: number
    /** `null` = all, `''` = unlabeled, non-empty string = that function label. */
    selected?: string | null
    hrefFor: (func: string | null) => string
  } = $props()

  // High-contrast light/dark adaptive slice palette matching the site's semantic color families.
  const PALETTE = [
    'var(--slice-1)',
    'var(--slice-2)',
    'var(--slice-3)',
    'var(--slice-4)',
    'var(--slice-5)',
    'var(--slice-6)',
    'var(--slice-7)',
  ] as const
  const UNLABELED_COLOR = 'var(--slice-muted)'

  const RADIUS = 62
  const STROKE = 28
  const CX = 88
  const CY = 88

  type Segment = {
    func: string
    label: string
    n: number
    pct: number
    color: string
    path: string
    active: boolean
    target: string
  }

  function arcPath(startAngle: number, endAngle: number): string {
    const span = endAngle - startAngle
    // A single 100% slice cannot use one SVG arc whose start and end points coincide; split into two semicircles.
    if (span >= Math.PI * 2 - 1e-4) {
      return `M ${CX} ${CY - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CX} ${CY + RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CX} ${CY - RADIUS}`
    }
    const x1 = CX + RADIUS * Math.cos(startAngle)
    const y1 = CY + RADIUS * Math.sin(startAngle)
    const x2 = CX + RADIUS * Math.cos(endAngle)
    const y2 = CY + RADIUS * Math.sin(endAngle)
    const large = span > Math.PI ? 1 : 0
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
  }

  const sliceSum = $derived(slices.reduce((acc, item) => acc + item.n, 0))

  const segments = $derived.by((): Segment[] => {
    const sum = sliceSum
    if (!sum) return []
    let cursor = -Math.PI / 2
    let colorIndex = 0
    return slices.map(item => {
      const share = item.n / sum
      const start = cursor
      const end = cursor + share * Math.PI * 2
      cursor = end
      const unlabeled = item.func === ''
      const color = unlabeled ? UNLABELED_COLOR : PALETTE[colorIndex++ % PALETTE.length]
      const label = unlabeled ? t('part.unlabeled') : item.func
      const active = selected === item.func
      return {
        func: item.func,
        label,
        n: item.n,
        pct: Math.round(share * 100),
        color,
        path: arcPath(start, end),
        active,
        target: active ? hrefFor(null) : hrefFor(item.func),
      }
    })
  })
</script>

{#if segments.length}
  <figure class="chart">
    <div class="ring">
      <svg viewBox="0 0 176 176" role="img" aria-label={t('part.chartLabel', { part, count: total })}>
        {#each segments as seg (seg.func)}
          <a
            href={seg.target}
            class="slice"
            class:active={seg.active}
            class:dim={selected !== null && !seg.active}
            aria-label={`${seg.label}: ${seg.n} (${seg.pct}%)`}
            aria-current={seg.active ? 'page' : undefined}
          >
            <path d={seg.path} fill="none" stroke={seg.color} stroke-width={seg.active ? STROKE + 5 : STROKE} />
            <title>{seg.label}: {seg.n} ({seg.pct}%)</title>
          </a>
        {/each}
        {#if segments.length > 1}
          <!-- Crisp dividers between slices without hiding focus outlines -->
          {#each segments as seg, i (seg.func)}
            {@const angle = -Math.PI / 2 + segments.slice(0, i).reduce((acc, item) => acc + item.n, 0) / Math.max(sliceSum, 1) * Math.PI * 2}
            <line
              x1={(CX + (RADIUS - STROKE / 2 - 3) * Math.cos(angle)).toFixed(2)}
              y1={(CY + (RADIUS - STROKE / 2 - 3) * Math.sin(angle)).toFixed(2)}
              x2={(CX + (RADIUS + STROKE / 2 + 3) * Math.cos(angle)).toFixed(2)}
              y2={(CY + (RADIUS + STROKE / 2 + 3) * Math.sin(angle)).toFixed(2)}
              stroke="var(--surface)"
              stroke-width="2"
              pointer-events="none"
            />
          {/each}
        {/if}
        <text x={CX} y={CY - 2} text-anchor="middle" class="center-glyph" aria-hidden="true">{part}</text>
        <text x={CX} y={CY + 17} text-anchor="middle" class="center-count" aria-hidden="true">{t('part.sliceKinds', { n: segments.length })}</text>
      </svg>
    </div>

    <figcaption class="legend-wrap">
      <table class="legend">
        <caption class="sr-only">{t('part.chartLabel', { part, count: total })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('field.partFunction')}</th>
            <th scope="col" class="num">{t('part.share')}</th>
            <th scope="col" class="num">{t('part.recordsCount')}</th>
          </tr>
        </thead>
        <tbody>
          {#each segments as seg (seg.func)}
            <tr class:active={seg.active}>
              <td>
                <a href={seg.target} class="legend-link" aria-current={seg.active ? 'page' : undefined}>
                  <span class="swatch" style:background={seg.color} aria-hidden="true"></span>
                  <span class="label">{seg.label}</span>
                </a>
              </td>
              <td class="num pct">{seg.pct}%</td>
              <td class="num cnt">{seg.n}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </figcaption>
  </figure>
{/if}

<style>
  .chart {
    --slice-1: light-dark(#6356e5, #9c92ff);
    --slice-2: light-dark(#c77214, #f5a64b);
    --slice-3: light-dark(#1a5ba6, #72b4ff);
    --slice-4: light-dark(#1e7a48, #6fd199);
    --slice-5: light-dark(#b0305a, #f283a7);
    --slice-6: light-dark(#0e7490, #55c8e3);
    --slice-7: light-dark(#7c3aed, #b994ff);
    --slice-muted: light-dark(#a4a4b0, #666673);
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    gap: 16px 24px;
    align-items: center;
    margin: 0;
  }
  .ring { display: flex; justify-content: center }
  .ring svg { width: 176px; height: 176px; overflow: visible }
  .slice { cursor: pointer; outline: none }
  .slice path { transition: stroke-width 140ms ease, opacity 140ms ease }
  .slice:hover path { opacity: 0.88 }
  .slice.dim path { opacity: 0.42 }
  .slice:focus-visible path { stroke-dasharray: 4 2; outline: 3px solid var(--focus-ring) }
  .center-glyph { fill: var(--ink); font-size: 28px; font-weight: 600 }
  .center-count { fill: var(--muted); font-size: 11.5px }
  .legend-wrap { min-width: 0 }
  .legend { width: 100%; border-collapse: collapse; font-size: 13.5px }
  .legend th { padding: 0 6px 6px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 500; text-align: start }
  .legend td { padding: 4px 6px; border-bottom: 1px solid var(--line); vertical-align: middle }
  .legend tr:last-child td { border-bottom: 0 }
  .legend tr.active td { background: var(--accent-light) }
  .legend-link { display: flex; align-items: center; gap: 8px; min-block-size: 28px; color: var(--ink) }
  .legend-link:hover .label { color: var(--accent); text-decoration: underline; text-underline-offset: 3px }
  .legend tr.active .label { color: var(--accent); font-weight: 600 }
  .swatch { width: 11px; height: 11px; border-radius: 3px; flex: none }
  .legend .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap }
  .pct { font-weight: 600 }
  .cnt { color: var(--muted) }
  @media (max-width: 640px) {
    .chart { grid-template-columns: minmax(0, 1fr) }
  }
  @media (prefers-reduced-motion: reduce) {
    .slice path { transition: none }
  }
  @media (forced-colors: active) {
    .swatch { forced-color-adjust: none; border: 1px solid CanvasText }
    .legend tr.active td { outline: 2px solid Highlight }
  }
</style>
