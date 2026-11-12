<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { cleanIds } from '$lib/ids'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const source = $derived(data.source)
  const heading = $derived(source.title || source.url || t('source.title'))
  const facts = [
    { key: 'author', label: 'field.author' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
  ] as const
</script>

<Seo title={heading} />
<div class="page stack">
  <a class="text-link back" href={href()}>← {t('nav.browse')}</a>
  <div class="stack intro">
    <span class="badge">{t('source.title')}</span>
    <h1>{heading}</h1>
    {#if source.url && /^https?:\/\//i.test(source.url)}<a class="text-link url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url} ↗</a>{/if}
    <dl class="facts">{#each facts as fact}{#if source[fact.key]}<div><dt>{t(fact.label)}</dt><dd>{source[fact.key]}</dd></div>{/if}{/each}</dl>
  </div>
  <section class="stack">
    <h2>{t('entry.sightings')}</h2>
    <div class="tiles">
      {#each data.tiles as tile (tile.id)}
        <div class="seen">
          <Tile {tile} glyph={data.glyphs?.[cleanIds(tile.ids ?? '')]} />
          {#if tile.pages.length}<span class="pages">{t('field.page')} {tile.pages.join(', ')}</span>{/if}
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .intro { gap:8px; max-width:800px } .intro .badge { align-self:start }
  .url { overflow-wrap:anywhere }
  .facts { display:flex; flex-wrap:wrap; gap:12px 28px; margin:4px 0 0 } .facts:empty { display:none } dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(145px,1fr)); gap:22px 16px }
  .seen { display:flex; flex-direction:column; gap:2px; min-width:0 }
  .pages { font-size:12px; color:var(--muted); overflow-wrap:anywhere }
  @media(max-width:500px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)) } }
</style>
