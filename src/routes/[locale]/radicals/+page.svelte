<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import type { Branch } from '$lib/radicals'
  import { href, t } from '$lib/t'

  const TOP_PARTS = 12

  let { data } = $props()
  const listed = (branch: Branch) => href(`?radical=${encodeURIComponent(branch.path)}`)
  const partHref = (part: string) => href(`/part/${encodeURIComponent(part)}`)
  const topParts = $derived(data.parts.slice(0, TOP_PARTS))
  const moreParts = $derived(data.parts.slice(TOP_PARTS))
</script>

{#snippet pieIcon()}
  <svg class="pie-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M8 8V1.5A6.5 6.5 0 0 1 14.5 8Z" fill="currentColor" />
  </svg>
{/snippet}

{#snippet partCard(item: { part: string; n: number })}
  <li>
    <a class="part-card" href={partHref(item.part)} aria-label={t('part.chartLabel', { part: item.part, count: item.n })}>
      {@render pieIcon()}
      <span class="glyph">{item.part}</span>
      <span class="count">{item.n}</span>
    </a>
  </li>
{/snippet}

{#snippet under(branches: Branch[])}
  {#if branches.length}
    <ul class="branches">
      {#each branches as branch (branch.path)}
        {@const branchPart = data.radicalParts[branch.radical]}
        <li>
          <a class="branch" href={listed(branch)}><span class="glyph">{branch.radical}</span><span class="count">{branch.records}</span></a>{#if branchPart}<a class="branch-part" href={partHref(branchPart.part)} aria-label={t('part.chartLabel', { part: branch.radical, count: branchPart.n })} title={t('part.chartHeading')}>{@render pieIcon()}<span class="count">{branchPart.n}</span></a>{/if}{@render under(branch.branches)}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<Seo title={t('nav.parts')} />
<div class="page stack">
  <h1>{t('nav.parts')}</h1>

  {#if data.parts.length}
    <section class="stack section" aria-labelledby="annotated-heading">
      <h2 id="annotated-heading" class="section-heading">{t('parts.annotatedHeading')}</h2>
      <ul class="parts-grid">
        {#each topParts as item (item.part)}{@render partCard(item)}{/each}
      </ul>
      {#if moreParts.length}
        <details class="more-parts">
          <summary class="text-link small">{t('parts.showAll', { n: data.parts.length })}</summary>
          <ul class="parts-grid">
            {#each moreParts as item (item.part)}{@render partCard(item)}{/each}
          </ul>
        </details>
      {/if}
    </section>
  {/if}

  <section class="stack section" aria-labelledby={data.parts.length ? 'radicals-heading' : undefined}>
    {#if data.parts.length}
      <h2 id="radicals-heading" class="section-heading">{t('nav.radicals')}</h2>
    {/if}
    {#if data.groups.length}
      <dl class="table">
        {#each data.groups as group (group.strokes ?? 0)}
          <div class="row">
            <dt>{#if group.strokes === null}<span class="sr-only">{t('field.encodingOther')}</span><span aria-hidden="true">＋</span>{:else}<span class="sr-only">{t('field.strokes')}</span>{group.strokes}{/if}</dt>
            <dd>
              {#each group.radicals as radical (radical.path)}
                {@const selfPart = data.radicalParts[radical.radical]}
                {@const variants = data.variantsByRadical[radical.radical] ?? []}
                <div class="radical" class:branched={radical.branches.length || selfPart || variants.length}>
                  <a class="root" href={listed(radical)}><span class="glyph">{radical.radical}</span><span class="count">{radical.records}</span></a>
                  {#if selfPart || variants.length}
                    <div class="part-links">
                      {#if selfPart}
                        <a class="part-link" href={partHref(selfPart.part)} aria-label={t('part.chartLabel', { part: radical.radical, count: selfPart.n })} title={t('part.chartHeading')}>
                          {@render pieIcon()}
                          <span class="count">{selfPart.n}</span>
                        </a>
                      {/if}
                      {#each variants as variant (variant.part)}
                        <a class="part-link" href={partHref(variant.part)} aria-label={t('part.chartLabel', { part: variant.part, count: variant.n })} title={t('part.chartHeading')}>
                          {@render pieIcon()}
                          <span class="variant-glyph">{variant.part}</span>
                          <span class="count">{variant.n}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}
                  {@render under(radical.branches)}
                </div>
              {/each}
            </dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p class="empty muted">{t('browse.emptyAll')}</p>
    {/if}
  </section>
</div>

<style>
  .section { gap: 10px }
  .section-heading { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: .04em }
  .parts-grid { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none }
  .part-card { display: inline-flex; align-items: center; gap: 6px; min-block-size: 38px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .part-card:hover { border-color: var(--accent); background: var(--surface-selected) }
  .part-card .glyph { font-size: 19px; line-height: 1.25 }
  .part-card .count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums }
  .more-parts summary { cursor: pointer; display: inline-flex; align-items: center; min-block-size: 32px; color: var(--muted) }
  .more-parts summary:hover { color: var(--ink) }
  .more-parts .parts-grid { padding-top: 6px }
  .pie-icon { color: var(--accent); flex: none }
  .table { display: flex; flex-direction: column; margin: 0; border-top: 1px solid var(--line) }
  .row { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--line) }
  dt { padding-top: 10px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; text-align: end; padding-inline-end: 8px }
  dd { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 }
  .radical { display: flex; flex-wrap: wrap; align-items: stretch; max-inline-size: 100%; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .root, .branch { display: inline-flex; align-items: baseline; gap: 6px; border-radius: 7px }
  .root { min-width: 64px; min-height: 40px; padding: 4px 10px; justify-content: space-between }
  .root .glyph { font-size: 22px; line-height: 1.3 }
  .root:hover, .branch:hover { background: var(--surface-selected) }
  .part-links { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 4px; border-inline-start: 1px solid var(--line) }
  .part-link, .branch-part { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 2px 7px; border-radius: 6px; background: var(--accent-light); color: var(--accent); font-size: 12px; font-variant-numeric: tabular-nums }
  .part-link:hover, .branch-part:hover { background: var(--surface-selected) }
  .part-link .count, .branch-part .count { color: inherit }
  .variant-glyph { font-size: 16px; line-height: 1.2; color: var(--ink) }
  .branches { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 0; padding: 0; list-style: none }
  .radical > .branches { padding: 4px; border-inline-start: 1px solid var(--line) }
  .branches li { display: flex; align-items: center; gap: 2px }
  .branches .branches::before { content: '›'; color: var(--muted); padding-inline: 2px }
  .branch { min-height: 32px; padding: 2px 8px; align-items: center }
  .branch .glyph { font-size: 17px; line-height: 1.3 }
  .empty { padding: 48px 16px; text-align: center }
  @media (max-width: 500px) { .row { grid-template-columns: 28px minmax(0, 1fr) } dt { padding-inline-end: 0 } }
</style>
