<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const listed = (value: string) => href(`?genre=${encodeURIComponent(value)}`)
</script>

{#snippet chip(item: { value: string; label: string; n: number }, strong = false)}
  <a class="chip" class:strong href={listed(item.value)}><span class="name">{item.label}</span><span class="count">{item.n}</span></a>
{/snippet}

<Seo title={t('nav.categories')} />
<div class="page stack">
  <h1>{t('nav.categories')}</h1>
  <dl class="table">
    <div class="row">
      <dt></dt>
      <dd>{#each data.standalone as item (item.value)}{@render chip(item)}{/each}</dd>
    </div>
    {#each data.groups as group (group.parent.value)}
      <div class="row">
        <dt class="parent">{@render chip(group.parent, true)}</dt>
        <dd>{#each group.children as item (item.value)}{@render chip(item)}{/each}</dd>
      </div>
    {/each}
    {#if data.custom.length}
      <div class="row">
        <dt class="parent"><span class="label">{t('categories.custom')}</span></dt>
        <dd>{#each data.custom as item (item.value)}{@render chip(item)}{/each}</dd>
      </div>
    {/if}
  </dl>
</div>

<style>
  .table { display:flex; flex-direction:column; margin:0; border-top:1px solid var(--line) }
  .row { display:grid; grid-template-columns:160px minmax(0,1fr); gap:8px; padding:12px 0; border-bottom:1px solid var(--line) }
  dt { padding-top:2px }
  dd { display:flex; flex-wrap:wrap; gap:8px; margin:0 }
  .chip { display:inline-flex; align-items:baseline; justify-content:space-between; gap:10px; min-height:36px; padding:4px 10px; align-items:center; border:1px solid var(--line); border-radius:8px; background:var(--surface) }
  .chip:hover { background:var(--surface-selected) }
  .strong { font-weight:500 }
  .count { color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums }
  @media(max-width:500px) { .row { grid-template-columns:minmax(0,1fr) } }
</style>
