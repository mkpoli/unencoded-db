<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t } from '$lib/t'
  import type { Branch } from '$lib/radicals'
  let { data } = $props()
  const listed = (branch: Branch) => href(`?radical=${encodeURIComponent(branch.path)}`)
</script>

{#snippet under(branches: Branch[])}
  {#if branches.length}
    <ul class="branches">
      {#each branches as branch (branch.path)}
        <li><a class="branch" href={listed(branch)}><span class="glyph">{branch.radical}</span><span class="count">{branch.records}</span></a>{@render under(branch.branches)}</li>
      {/each}
    </ul>
  {/if}
{/snippet}

<Seo title={t('nav.radicals')} />
<div class="page stack">
  <h1>{t('nav.radicals')}</h1>
  {#if data.groups.length}
    <dl class="table">
      {#each data.groups as group (group.strokes)}
        <div class="row">
          <dt><span class="sr-only">{t('field.strokes')}</span>{group.strokes}</dt>
          <dd>
            {#each group.radicals as radical (radical.path)}
              <div class="radical" class:branched={radical.branches.length}>
                <a class="root" href={listed(radical)}><span class="glyph">{radical.radical}</span><span class="count">{radical.records}</span></a>
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
</div>

<style>
  .table { display:flex; flex-direction:column; margin:0; border-top:1px solid var(--line) }
  .row { display:grid; grid-template-columns:48px minmax(0,1fr); gap:8px; padding:12px 0; border-bottom:1px solid var(--line) }
  dt { padding-top:10px; color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; text-align:end; padding-inline-end:8px }
  dd { display:flex; flex-wrap:wrap; gap:8px; margin:0 }
  .radical { display:flex; align-items:stretch; border:1px solid var(--line); border-radius:8px; background:var(--surface) }
  .root, .branch { display:inline-flex; align-items:baseline; gap:6px; border-radius:7px }
  .root { min-width:64px; min-height:40px; padding:4px 10px; justify-content:space-between }
  .root .glyph { font-size:22px; line-height:1.3 }
  .root:hover, .branch:hover { background:var(--surface-selected) }
  .branches { display:flex; flex-wrap:wrap; align-items:center; gap:2px; margin:0; padding:0; list-style:none }
  .radical > .branches { padding:4px; border-inline-start:1px solid var(--line) }
  .branches li { display:flex; align-items:center; gap:2px }
  .branches .branches::before { content:'›'; color:var(--muted); padding-inline:2px }
  .branch { min-height:32px; padding:2px 8px; align-items:center }
  .branch .glyph { font-size:17px; line-height:1.3 }
  .empty { padding:48px 16px; text-align:center }
  @media(max-width:500px) { .row { grid-template-columns:28px minmax(0,1fr) } dt { padding-inline-end:0 } }
</style>
