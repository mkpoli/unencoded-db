<script lang="ts">
  import EvidenceDate from '$lib/components/EvidenceDate.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import ViaChain from '$lib/components/ViaChain.svelte'
  import { recordCode } from '$lib/code'
  import { decadeNumber, decadeOf, decadeRuns } from '$lib/dates'
  import { decadeName, href, media, t, yearName, yearsName } from '$lib/t'
  let { data } = $props()
  const decadeList = (decade: number) => href(`?decade=${decade}&sort=earliest`)
  const fromDecade = (decade: number) => href(`/chronology?from=${decade}#y${decade}`)
  const paged = (query: string) => href(`/chronology?${query}`)
  // Every decade from the first to the last, empty ones too, so the gaps show on the bar chart. A gap of more
  // than four centuries is drawn as a break in the axis.
  const runs = $derived(decadeRuns(data.decades.map(row => row.decade), 40))
  // The decade a tick stands at names its first year: the start of a century, or of a run that has room before the next.
  const century = (decade: number) => decade >= 0 ? decade % 100 === 0 : decadeNumber(decade) % 100 === 90
  const ticked = (run: number[], i: number) => century(run[i]) || (i === 0 && !run.slice(1, 5).some(century))
  const lastYear = (decade: number) => decade < 0 ? decade + (decade === -8 ? 8 : 9) : decade + 9
  const most = $derived(Math.max(1, ...data.decades.map(row => row.n)))
  const counts = $derived(new Map(data.decades.map(row => [row.decade, row.n])))
  // The table's decades, each its own group of rows, with the year written only where it changes.
  const groups = $derived.by(() => {
    const out: { decade: number; rows: { entry: (typeof data.entries)[number]; showYear: boolean }[] }[] = []
    let year: number | null = null
    for (const entry of data.entries) {
      const decade = decadeOf(entry.year)
      if (out.at(-1)?.decade !== decade) { out.push({ decade, rows: [] }); year = null }
      out.at(-1)!.rows.push({ entry, showYear: entry.year !== year })
      year = entry.year
    }
    return out
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
      {#each runs as run, r (run[0])}
        {#if r}<li class="break" aria-hidden="true" title={yearsName(lastYear(runs[r - 1].at(-1)!) + 1, run[0] - 1)}>⋯</li>{/if}
        {#each run as decade, i (decade)}
          {@const n = counts.get(decade) ?? 0}
          <li class:century={century(decade)}>
            {#if n}<a href={fromDecade(decade)} title="{decadeName(decade)} · {n}"><span class="bar" style:height="{Math.max(6, (n / most) * 100)}%"></span><span class="sr-only">{decadeName(decade)} {n}</span></a>
            {:else}<span class="gap" title={decadeName(decade)}></span>{/if}
            {#if ticked(run, i)}<span class="tick" aria-hidden="true">{yearName(decade)}</span>{/if}
          </li>
        {/each}
      {/each}
    </ol>
    {#if data.earlier}<a class="more earlier" href={paged(data.earlier)}>↑ {t('chronology.earlier')}</a>{/if}
    <table class="chronicle">
      <thead><tr><th scope="col" class="year">{t('chronology.year')}</th><th scope="col">{t('chronology.record')}</th></tr></thead>
      {#each groups as group (group.decade)}
        <tbody>
          <tr class="decade" id="y{group.decade}"><th scope="rowgroup" colspan="2"><a href={decadeList(group.decade)}>{decadeName(group.decade)}</a><span class="n">{counts.get(group.decade) ?? 0}</span></th></tr>
          {#each group.rows as row (row.entry.tile.id)}
            {@const entry = row.entry}
            <tr class="entry" class:first={row.showYear}>
              <td class="year">{#if row.showYear}{yearName(entry.year)}{/if}</td>
              <td class="what">
                <a class="record" href={href(`/entry/${entry.tile.id}`)}>
                  <span class="glyph">{#if entry.tile.ids}<IdsGlyph ids={entry.tile.ids} layout={entry.tile.layout} path={data.glyphs[entry.tile.id]} />{:else if entry.tile.cover_key}<img src={media(entry.tile.cover_key)} alt="" loading="lazy" decoding="async" />{/if}</span>
                  <span class="text">
                    <span class="name">{#if entry.tile.ids}<span class="ids">{entry.tile.ids}</span>{/if}<span class="code">{recordCode(entry.tile.id)}</span></span>
                    {#if entry.sighting}<span class="source">{#if entry.sighting.title}『{entry.sighting.title}』{:else if entry.sighting.place}{entry.sighting.place}{/if}{#if entry.sighting.author}<span class="muted"> {entry.sighting.author}</span>{/if}{#if entry.sighting.date}<span class="date" title={t(entry.tile.firstYearKind === 'original' ? 'field.originalDate' : 'field.reportDate')}>（<EvidenceDate linked={false} text={entry.sighting.date} reading={data.dates.get(entry.sighting.date)} />）</span>{/if}</span>{/if}
                  </span>
                </a>
                {#if entry.sighting?.vias.length}<div class="via"><ViaChain vias={entry.sighting.vias} dates={data.dates} /></div>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
    {#if data.later}<a class="more later" href={paged(data.later)}>↓ {t('chronology.later')}</a>{/if}
  {:else}
    <p class="empty muted">{t('browse.emptyAll')}</p>
  {/if}
</div>

<style>
  .heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:8px 16px }
  .totals { display:flex; flex-wrap:wrap; gap:4px 16px; margin:0; font-variant-numeric:tabular-nums }
  .bars { display:flex; align-items:flex-end; gap:2px; height:120px; margin:0; padding:6px 28px 22px 6px; list-style:none; overflow-x:auto }
  .bars li { position:relative; flex:1 0 6px; height:100%; display:flex; align-items:flex-end }
  .bars li.century { border-inline-start:1px solid var(--line) }
  .bars .break { flex:0 0 64px; align-items:flex-end; justify-content:center; color:var(--muted); line-height:1; user-select:none }
  .bars a { display:flex; align-items:flex-end; width:100%; height:100% }
  .bar { display:block; width:100%; border-radius:2px 2px 0 0; background:var(--accent) }
  .bars a:hover .bar, .bars a:focus-visible .bar { background:var(--ink) }
  .gap { display:block; width:100%; height:2px; background:var(--line) }
  .tick { position:absolute; inset-block-start:calc(100% + 4px); inset-inline-start:2px; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap }
  /* The 年表: one axis down the page, the year in a shaded gutter beside what was first seen in it. */
  .chronicle { width:100%; table-layout:fixed; border-collapse:collapse; border:1px solid var(--line-strong); font-size:14px; line-height:1.5 }
  .chronicle thead th { padding:10px 12px; border-bottom:1px solid var(--line-strong); font-size:13px; font-weight:500; color:var(--muted); text-align:start }
  .chronicle th.year, .chronicle td.year { width:72px; padding:8px 10px; background:var(--surface-sunken); color:var(--muted); font-size:12.5px; font-variant-numeric:tabular-nums; text-align:end; vertical-align:top; white-space:nowrap }
  .chronicle thead th.year { text-align:end }
  .decade th { padding:14px 12px 6px; border-top:1px solid var(--line-strong); background:var(--surface); text-align:start; font-size:13px; font-weight:600 }
  .decade a:hover { text-decoration:underline }
  .decade .n { margin-inline-start:8px; font-weight:400; color:var(--muted); font-variant-numeric:tabular-nums }
  .entry.first td { border-top:1px solid var(--line) }
  .decade + .entry.first td { border-top:none }
  tbody + tbody .decade th { border-top:1px solid var(--line-strong) }
  .what { padding:4px 12px }
  .via { margin-top:4px; margin-inline-start:52px }
  .record { display:flex; align-items:center; gap:12px; min-width:0; padding:2px 0 }
  .record:hover .ids, .record:hover .source { text-decoration:underline; text-decoration-color:var(--line-strong) }
  .glyph { flex:none; display:grid; place-items:center; width:40px; height:40px; overflow:hidden; border-radius:4px; background:var(--surface-tile); color:var(--ink) }
  .glyph :global(.sequence) { font-size:9px; padding:1px }
  .glyph img { width:100%; height:100%; object-fit:contain }
  .text { display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; min-width:0 }
  .name { display:inline-flex; flex-wrap:wrap; align-items:baseline; min-inline-size:0; gap:2px 8px }
  .ids { color:var(--muted) }
  .code { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums }
  .source { min-width:0; overflow-wrap:anywhere }
  .date { color:var(--muted); font-variant-numeric:tabular-nums }
  .more { align-self:center; font-size:14px; color:var(--muted) }
  .more:hover { color:var(--ink) }
  .empty { padding:48px 16px; text-align:center }
  @media(max-width:640px) { .chronicle th.year, .chronicle td.year { width:52px; padding-inline:6px } .what { padding-inline:8px } }
</style>
