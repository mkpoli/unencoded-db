<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('nav.parts')} />
<div class="page stack">
  <div class="head">
    <h1>{t('nav.parts')}</h1>
    <a class="text-link small" href={href('/radicals')}>{t('nav.radicals')}</a>
  </div>
  {#if data.parts.length}
    <ul class="grid">
      {#each data.parts as item (item.part)}
        <li>
          <a class="part-card" href={href(`/part/${encodeURIComponent(item.part)}`)}>
            <span class="glyph">{item.part}</span>
            <span class="count">{item.n}</span>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty muted">{t('parts.empty')}</p>
  {/if}
</div>

<style>
  .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none }
  .part-card { display: inline-flex; align-items: baseline; justify-content: space-between; gap: 8px; min-inline-size: 72px; min-block-size: 44px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .part-card:hover { border-color: var(--accent); background: var(--surface-selected) }
  .glyph { font-size: 22px; line-height: 1.3 }
  .count { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums }
  .empty { padding: 48px 16px; text-align: center }
</style>
