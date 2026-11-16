<script lang="ts">
  import CategoryBoard from '$lib/components/CategoryBoard.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { arrangeGenres, type GenreRow } from '$lib/genres'
  import { href, t } from '$lib/t'
  let { data } = $props()
  let editing = $state(false)
  const { standalone, groups } = $derived(arrangeGenres(data.categories))
  const counts = $derived(new Map(data.categories.map(category => [category.name, category.n])))
  const listed = (value: string) => href(`?genre=${encodeURIComponent(value)}`)
</script>

{#snippet chip(item: GenreRow, strong = false)}
  <a class="chip" class:strong href={listed(item.value)}><span class="name">{item.label}</span><span class="count">{counts.get(item.value) ?? 0}</span></a>
{/snippet}

<Seo title={t('nav.categories')} />
<div class="page stack">
  <div class="heading">
    <h1>{t('nav.categories')}</h1>
    <button class="button" class:primary={editing} type="button" aria-pressed={editing} onclick={() => (editing = !editing)}>{editing ? t('categories.done') : t('form.edit')}</button>
  </div>
  {#if editing}
    <CategoryBoard categories={data.categories} changes={data.changes} />
  {:else}
    <dl class="table">
      {#if standalone.length}
        <div class="row">
          <dt></dt>
          <dd>{#each standalone as item (item.value)}{@render chip(item)}{/each}</dd>
        </div>
      {/if}
      {#each groups as group (group.root.value)}
        <div class="row">
          <dt class="parent">{@render chip(group.root, true)}</dt>
          <dd>{#each group.rows as item (item.value)}<span class="tier" style:margin-inline-start="{Math.max(0, item.depth - 1) * 16}px">{@render chip(item)}</span>{/each}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</div>

<style>
  .heading { display:flex; align-items:center; justify-content:space-between; gap:12px }
  .table { display:flex; flex-direction:column; margin:0; border-top:1px solid var(--line) }
  .row { display:grid; grid-template-columns:160px minmax(0,1fr); gap:8px; padding:12px 0; border-bottom:1px solid var(--line) }
  dt { padding-top:2px }
  dd { display:flex; flex-wrap:wrap; gap:8px; margin:0 }
  .tier { display:inline-flex; max-width:100% }
  .chip { display:inline-flex; align-items:center; justify-content:space-between; gap:10px; min-height:36px; padding:4px 10px; border:1px solid var(--line); border-radius:8px; background:var(--surface) }
  .chip:hover { background:var(--surface-selected) }
  .strong { font-weight:500 }
  .count { color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums }
  @media(max-width:500px) { .row { grid-template-columns:minmax(0,1fr) } }
</style>
