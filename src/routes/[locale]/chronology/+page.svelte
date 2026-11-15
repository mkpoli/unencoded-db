<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const decadeList = (decade: number) => href(`?decade=${decade}&sort=earliest`)
  const pageFrom = (decade: number) => href(`/chronology?from=${decade}`)
  // Every decade from the first to the last, empty ones too, so the gaps show on the bar chart.
  const span = $derived.by(() => {
    if (!data.decades.length) return []
    const held = new Map(data.decades.map(row => [row.decade, row.n]))
    const first = data.decades[0].decade, last = data.decades.at(-1)!.decade
    return Array.from({ length: (last - first) / 10 + 1 }, (_, i) => ({ decade: first + i * 10, n: held.get(first + i * 10) ?? 0 }))
  })
  const most = $derived(Math.max(1, ...data.decades.map(row => row.n)))
  // The page's decades under their centuries.
  const centuries = $derived.by(() => {
    const groups: { century: number; rows: typeof data.shown }[] = []
    for (const row of data.shown) {
      const century = Math.floor(row.decade / 100) * 100
      if (groups.at(-1)?.century === century) groups.at(-1)!.rows.push(row)
      else groups.push({ century, rows: [row] })
    }
    return groups
  })
</script>

<Seo title={t('nav.chronology')} />
<div class="page stack">
  <div class="heading">
    <h1>{t('nav.chronology')}</h1>
    {#if data.decades.length}<p class="muted totals"><span>{t('chronology.dated', { n: data.dated })}</span><span>{t('chronology.undated', { n: data.undated })}</span></p>{/if}
  </div>
  {#if data.decades.length}
    <ol class="bars" aria-label={t('nav.chronology')}>
      {#each span as row (row.decade)}
        <li class:century={row.decade % 100 === 0}>
          {#if row.n}<a href={decadeList(row.decade)} title="{t('browse.decade', { n: row.decade })} · {row.n}"><span class="bar" style:height="{Math.max(6, (row.n / most) * 100)}%"></span><span class="sr-only">{t('browse.decade', { n: row.decade })} {row.n}</span></a>
          {:else}<span class="gap" title={t('browse.decade', { n: row.decade })}></span>{/if}
          {#if row.decade % 100 === 0 || (row.decade === span[0].decade && 100 - (row.decade % 100) >= 50)}<span class="tick" aria-hidden="true">{row.decade}</span>{/if}
        </li>
      {/each}
    </ol>
    {#each centuries as group (group.century)}
      <section class="stack century-block">
        <h2>{group.century}–{group.century + 99}</h2>
        {#each group.rows as row (row.decade)}
          <div class="decade" id="y{row.decade}">
            <a class="label" href={decadeList(row.decade)}><span class="name">{t('browse.decade', { n: row.decade })}</span><span class="n">{row.n}</span></a>
            <div class="tiles">{#each row.tiles as tile (tile.id)}<Tile {tile} glyph={data.glyphs[tile.id]} />{/each}</div>
          </div>
        {/each}
      </section>
    {/each}
    {#if data.earlier !== null || data.later !== null}
      <nav class="pager">
        {#if data.earlier !== null}<a class="button" href={pageFrom(data.earlier)}>← {t('chronology.earlier')}</a>{/if}
        {#if data.later !== null}<a class="button" href={pageFrom(data.later)}>{t('chronology.later')} →</a>{/if}
      </nav>
    {/if}
  {:else}
    <p class="empty muted">{t('browse.emptyAll')}</p>
  {/if}
</div>

<style>
  .heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:8px 16px }
  .totals { display:flex; gap:16px; margin:0; font-variant-numeric:tabular-nums }
  .bars { display:flex; align-items:flex-end; gap:2px; height:120px; margin:0; padding:6px 28px 22px 6px; list-style:none; overflow-x:auto }
  .bars li { position:relative; flex:1 0 6px; height:100%; display:flex; align-items:flex-end }
  .bars li.century { border-inline-start:1px solid var(--line) }
  .bars a { display:flex; align-items:flex-end; width:100%; height:100% }
  .bar { display:block; width:100%; border-radius:2px 2px 0 0; background:var(--accent) }
  .bars a:hover .bar, .bars a:focus-visible .bar { background:var(--ink) }
  .gap { display:block; width:100%; height:2px; background:var(--line) }
  .tick { position:absolute; inset-block-start:calc(100% + 4px); inset-inline-start:2px; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap }
  h2 { margin:8px 0 0; padding-bottom:6px; border-bottom:1px solid var(--line); font-size:15px; color:var(--muted); font-variant-numeric:tabular-nums }
  .century-block { gap:20px }
  .decade { display:grid; grid-template-columns:120px minmax(0,1fr); gap:16px; align-items:start }
  .label { display:flex; flex-direction:column; gap:2px; padding-top:4px }
  .label .name { font-weight:600 }
  .label .n { font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums }
  .label:hover .name { text-decoration:underline }
  /* A decade's earliest records sit in one row. */
  .tiles { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:12px 10px }
  .pager { display:flex; justify-content:space-between; gap:8px }
  .empty { padding:48px 16px; text-align:center }
  @media(max-width:640px) { .decade { grid-template-columns:minmax(0,1fr); gap:8px } .label { flex-direction:row; align-items:baseline; gap:8px } .tiles { grid-template-columns:repeat(4,minmax(0,1fr)) } }
</style>
