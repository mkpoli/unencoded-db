<script lang="ts">
  import CategoryBoard from '$lib/components/CategoryBoard.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { arrangeGenres, genreLabels, type GenreRow } from '$lib/genres'
  import type { CategoryChange } from '$lib/server/categories'
  import { href, t, when } from '$lib/t'
  let { data } = $props()
  let editing = $state(false)
  const { standalone, groups } = $derived(arrangeGenres(data.categories))
  const counts = $derived(new Map(data.categories.map(category => [category.name, category.n])))
  const labels = $derived(genreLabels(data.categories))
  const listed = (value: string) => href(`?genre=${encodeURIComponent(value)}`)

  // A change names its category by the label it has now, else by the one the change recorded.
  type Fields = { label?: string; parent?: string | null; position?: number }
  const fieldsOf = (raw: string | null): Fields => { try { return raw ? JSON.parse(raw) : {} } catch { return {} } }
  const parentLabel = (parent: string | null | undefined) => parent ? labels.get(parent) ?? parent : t('field.genreTopLevel')
  function described(change: CategoryChange) {
    const before = fieldsOf(change.before), after = fieldsOf(change.after)
    const name = labels.get(change.name) ?? after.label ?? before.label ?? change.name
    switch (change.kind) {
      case 'rename': return `${before.label ?? change.name} → ${after.label ?? change.name}`
      case 'move': return before.parent === after.parent ? `${name} · ${parentLabel(after.parent)}` : `${name} · ${parentLabel(before.parent)} → ${parentLabel(after.parent)}`
      case 'create': return after.parent ? `${name} · ${parentLabel(after.parent)}` : name
      default: return before.label ?? name
    }
  }
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
    <CategoryBoard categories={data.categories} />
    {#if data.changes.length}
      <section class="changes stack">
        <h2>{t('categories.changes')}</h2>
        <ol>
          {#each data.changes as change (change.id)}
            <li>
              <time datetime={change.at}>{when(change.at)}</time>
              <span class="who">{#if change.by_id}<a class="text-link" href={href(`/u/${change.by_id}`)}>{change.by_name}</a>{:else}—{/if}</span>
              <span class="kind">{t(`categories.change.${change.kind}`)}</span>
              <span class="what">{described(change)}</span>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
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
  .changes { gap:10px }
  .changes h2 { font-size:15px }
  .changes ol { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; border-top:1px solid var(--line) }
  .changes li { display:grid; grid-template-columns:150px 140px 100px minmax(0,1fr); gap:8px 12px; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px }
  .changes time, .changes .kind { color:var(--muted); font-variant-numeric:tabular-nums }
  .changes .who { overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  .changes .what { overflow-wrap:anywhere }
  @media(max-width:700px) { .changes li { grid-template-columns:minmax(0,1fr) auto } .changes .what { grid-column:1 / -1 } }
  @media(max-width:500px) { .row { grid-template-columns:minmax(0,1fr) } }
</style>
