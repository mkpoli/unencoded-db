<script lang="ts">
  import ParentSelect from '$lib/components/ParentSelect.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { GENRE_LENGTH_MAX, arrangeGenres, type GenreRow } from '$lib/genres'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  const { standalone, groups } = $derived(arrangeGenres(data.custom))
  const listed = (value: string) => href(`?genre=${encodeURIComponent(value)}`)
  const count = (value: string) => data.counts[`g:${value}`] ?? 0
</script>

{#snippet chip(item: GenreRow, strong = false)}
  <a class="chip" class:strong href={listed(item.value)}><span class="name">{item.label}</span><span class="count">{count(item.value)}</span></a>
{/snippet}

<Seo title={t('nav.categories')} />
<div class="page stack">
  <h1>{t('nav.categories')}</h1>
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
  <form class="add" method="POST" action="?/add">
    {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
    <input class="input" name="genre_new" maxlength={GENRE_LENGTH_MAX} autocomplete="off" required aria-label={t('field.genreAdd')} />
    <label class="sr-only" for="parent">{t('field.genreParent')}</label>
    <ParentSelect id="parent" name="genre_new_parent" custom={data.custom} />
    <button class="button primary" type="submit">{t('form.add')}</button>
  </form>
</div>

<style>
  .table { display:flex; flex-direction:column; margin:0; border-top:1px solid var(--line) }
  .row { display:grid; grid-template-columns:160px minmax(0,1fr); gap:8px; padding:12px 0; border-bottom:1px solid var(--line) }
  dt { padding-top:2px }
  dd { display:flex; flex-wrap:wrap; gap:8px; margin:0 }
  .tier { display:inline-flex; max-width:100% }
  .chip { display:inline-flex; align-items:center; justify-content:space-between; gap:10px; min-height:36px; padding:4px 10px; border:1px solid var(--line); border-radius:8px; background:var(--surface) }
  .chip:hover { background:var(--surface-selected) }
  .strong { font-weight:500 }
  .count { color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums }
  .add { display:flex; flex-wrap:wrap; gap:8px }
  .add .input { flex:1 1 160px; min-width:0; width:auto }
  .add .notice { flex-basis:100% }
  @media(max-width:500px) { .row { grid-template-columns:minmax(0,1fr) } }
</style>
