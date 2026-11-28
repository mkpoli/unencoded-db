<script lang="ts">
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { copyData } from '$lib/structured-data'
  import { href, locale, media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data } = $props()
  const heading = $derived(`${data.copy.title} · ${data.copy.collection}`)
  const summaryText = $derived(`${t('sources.digitizedCopy')} · ${heading} · ${t(data.totals.records === 1 ? 'source.record' : 'source.records', { n: data.totals.records })}`)
  const structured = $derived(copyData({
    locale: locale(), slug: data.copy.slug, name: heading, description: summaryText, siteName: t('app.name'), sourcesName: t('nav.sources'),
  }))
</script>

<Seo data={structured} title={heading} description={summaryText}
  image={href(`/sources/copy/${data.copy.slug}/card.png?v=${data.cardVersion}`)} imageAlt={heading} />
<div class="page narrow stack">
  <a class="text-link" href={href('/sources')}>← {t('nav.sources')}</a>
  <header class="stack">
    <span class="small muted">{t('sources.digitizedCopy')} · {data.copy.collection}</span>
    <h1>{data.copy.title}</h1>
    <div class="row"><span>{t('entry.sightings')} · {data.totals.sightings}</span>
      <span class="badge">{t(data.totals.records === 1 ? 'source.record' : 'source.records', { n: data.totals.records })}</span></div>
  </header>
  <ul class="evidence">
    {#each data.sightings as row (row.sighting)}
      <li>
        <a class="record" href={href(`/${recordCode(row.entry_id)}#sighting-${row.sighting}`)}>
          {#if row.ids}
            <span class="plate"><IdsGlyph ids={row.ids} layout={row.layout} path={data.glyphs[row.entry_id]} /></span>
          {/if}
          {#if row.thumb}
            <img class="plate scan" src={media(row.thumb)} alt="" loading="lazy" decoding="async" />
          {/if}
          <span class="label">{#if row.ids}<strong>{row.ids}</strong>{/if}<span>{t('entry.record', { id: recordCode(row.entry_id) })}<span class="sr-only"> · {t('entry.sightings')} {row.sighting}</span></span></span>
        </a>
        <div class="links">
          {#if row.page}<span>{t('field.page')} · {row.page}</span>{/if}
          {#each row.citations as citation (citation.source)}
            <div class="row">
              {#if citation.via}<span class="badge">{t('source.foundVia')}</span>{/if}
              <a class="text-link" href={citation.url} target="_blank" rel="noopener noreferrer">{t('sources.scan', { n: citation.scan })} ↗</a>
              <a class="text-link" href={href(`/source/${citation.source}`)}>{t('source.title')} {citation.source}</a>
            </div>
          {/each}
        </div>
      </li>
    {/each}
  </ul>
  {#if data.next}<a class="button more" href={`?after=${data.next}`}>{t('browse.more')}</a>{/if}
</div>

<style>
  .evidence { list-style:none; padding:0; margin:0 }
  li { display:flex; flex-wrap:wrap; gap:12px 24px; align-items:center; padding:12px 0; border-top:1px solid var(--line) }
  .record { display:flex; align-items:center; gap:12px; flex:1 1 15rem; min-width:0; overflow-wrap:anywhere }
  .record:hover strong { text-decoration:underline }
  .label { min-width:0 }
  .label strong, .label > span { display:block }
  .plate { display:grid; place-items:center; width:54px; height:54px; flex:none; overflow:hidden; background:var(--surface-tile); border-radius:6px }
  .scan { object-fit:contain }
  .links { flex:1 1 14rem; min-width:0; font-size:.875rem; overflow-wrap:anywhere }
  .more { align-self:start }
</style>
