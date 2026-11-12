<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { EXTENSION_E_WITHDRAWN, EXTENSION_E_WRONG_GLYPH } from '$lib/extension-e'
  import { cleanIds } from '$lib/ids'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const more = $derived(`?${new URLSearchParams({ before: String(data.next) })}`)
</script>

<Seo title={t('extensionE.title')} description={t('extensionE.intro', { total: EXTENSION_E_WITHDRAWN.length })} />
<div class="page stack">
  <header class="heading">
    <div class="stack intro"><h1>{t('extensionE.title')}</h1><p class="muted">{t('extensionE.intro', { total: EXTENSION_E_WITHDRAWN.length })}</p></div>
    <a class="button" href={href('/?collection=extension-e')}>{t('extensionE.browse')}</a>
  </header>
  <section class="stack">
    <h2>{t('extensionE.records')}</h2>
    {#if data.tiles.length}
      <div class="tiles">{#each data.tiles as tile (tile.id)}<Tile {tile} glyph={data.glyphs?.[cleanIds(tile.ids ?? '')]} />{/each}</div>
    {:else}
      <p class="muted">{t('browse.empty')}</p>
    {/if}
    {#if data.next}<div><a class="button" href={more}>{t('browse.more')}</a></div>{/if}
  </section>
  <section class="stack">
    <h2>{t('extensionE.withdrawn')} <a class="text-link source" href="https://www.unicode.org/irg/docs/n1841-ExtensionEWithdraw.pdf" rel="noopener">IRG N1841</a></h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>{t('extensionE.id')}</th><th>{t('extensionE.later')}</th></tr></thead>
        <tbody>
          {#each EXTENSION_E_WITHDRAWN as id (id)}
            <tr><td class="mono">{id}</td><td>{EXTENSION_E_WRONG_GLYPH.has(id) ? t('extensionE.wrongGlyph') : t('extensionE.unresolved')}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:start; gap:20px }
  .intro { gap:8px; max-width:720px }
  .source { font-weight:400; margin-left:8px }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:22px 16px }
  .table-wrap { overflow-x:auto }
  table { width:100%; border-collapse:collapse }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top }
  th { color:var(--muted); font-weight:500 }
  @media(max-width:500px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
