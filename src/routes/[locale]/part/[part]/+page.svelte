<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PartPieChart from '$lib/components/PartPieChart.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { browseHref } from '$lib/browse-params'
  import { roleLabel } from '$lib/composition-labels'
  import { href, locale, t } from '$lib/t'

  let { data } = $props()
  const at = locale()
  const basePath = $derived(href(`/part/${encodeURIComponent(data.part)}`))

  function filterHref(func: string | null, after: string | null = null): string {
    const params = new URLSearchParams()
    if (func === '') params.set('unlabeled', '1')
    else if (func !== null) params.set('func', func)
    if (after !== null) params.set('after', after)
    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }
</script>

<Seo title={t('part.title', { part: data.part })} />
<div class="page stack">
  <div class="row nav-row">
    <a class="text-link back" href={href('/parts')}>← {t('nav.parts')}</a>
    <a class="text-link small" href={browseHref(href(), { query: data.part })}>{t('part.browseAll', { part: data.part })}</a>
  </div>

  <div class="hero">
    <span class="specimen" aria-hidden="true">{data.part}</span>
    <div class="stack title">
      <h1>{t('part.title', { part: data.part })}</h1>
      <p class="muted">{t('part.total', { n: data.total })}</p>
    </div>
  </div>

  {#if data.slices.length}
    <section class="panel stack">
      <h2>{t('part.chartHeading')}</h2>
      <PartPieChart
        part={data.part}
        slices={data.slices}
        total={data.total}
        selected={data.selected}
        hrefFor={func => filterHref(func)}
      />
    </section>
  {/if}

  <section class="stack">
    <div class="head">
      <h2>{t('part.recordsHeading')}</h2>
      {#if data.slices.length}
        <nav class="filters" aria-label={t('field.partFunction')}>
          <a class="pill" class:active={data.selected === null} aria-current={data.selected === null ? 'page' : undefined} href={filterHref(null)}>
            {t('part.allFunctions')} <span class="cnt">{data.total}</span>
          </a>
          {#each data.slices as slice (slice.func)}
            {@const label = slice.func === '' ? t('part.unlabeled') : slice.func}
            {@const active = data.selected === slice.func}
            <a class="pill" class:active aria-current={active ? 'page' : undefined} href={filterHref(slice.func)}>
              {label} <span class="cnt">{slice.n}</span>
            </a>
          {/each}
        </nav>
      {/if}
    </div>

    {#if data.entries.length}
      <ul class="tiles">
        {#each data.entries as item (`${item.tile.id}:${item.role}:${item.func}`)}
          <li class="item">
            <Tile tile={item.tile} glyph={data.glyphs[item.tile.id] ?? null} />
            <div class="part-meta">
              {#if item.role}<span class="role-tag">{roleLabel(at, item.role)}</span>{/if}
              {#if item.func}<span class="func-tag">{item.func}</span>{/if}
            </div>
          </li>
        {/each}
      </ul>
      {#if data.more !== null}
        <div class="more-row">
          <a class="button" href={filterHref(data.selected, data.more)}>{t('part.more')}</a>
        </div>
      {/if}
    {:else}
      <p class="empty muted">{t('part.empty')}</p>
    {/if}
  </section>
</div>

<style>
  .nav-row { justify-content: space-between; align-items: baseline }
  .back { color: var(--muted) }
  .hero { display: flex; align-items: center; gap: 16px }
  .specimen { display: grid; place-items: center; inline-size: 64px; block-size: 64px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 36px; line-height: 1; flex: none }
  .title { gap: 4px }
  .panel { padding: 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
  .head { display: flex; flex-direction: column; gap: 10px }
  .filters { display: flex; flex-wrap: wrap; gap: 6px }
  .pill { display: inline-flex; align-items: baseline; gap: 6px; min-block-size: 32px; padding: 4px 11px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); font-size: 13px; color: var(--ink) }
  .pill:hover { border-color: var(--accent); color: var(--accent) }
  .pill.active { border-color: var(--accent); background: var(--accent-light); color: var(--accent); font-weight: 600 }
  .pill .cnt { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums }
  .pill.active .cnt { color: inherit }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--tile-size), 1fr)); gap: 18px 14px; margin: 0; padding: 0; list-style: none }
  .item { display: flex; flex-direction: column; gap: 5px; min-width: 0 }
  .part-meta { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0 }
  .role-tag, .func-tag { max-width: 100%; padding: 1px 6px; border-radius: 4px; font-size: 11px; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .role-tag { background: var(--surface-sunken); color: var(--muted) }
  .func-tag { background: var(--accent-light); color: var(--accent) }
  .more-row { display: flex; justify-content: center; padding-top: 8px }
  .empty { padding: 40px 16px; text-align: center }
  @media (max-width: 700px) { .panel { padding: 16px } }
</style>
