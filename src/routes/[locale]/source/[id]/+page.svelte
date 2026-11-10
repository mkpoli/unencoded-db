<script lang="ts">
  import { primaryIds } from '$lib/ids'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  type Source = { id: number; kind: string; title: string | null; author: string | null; publisher: string | null; year: string | null; place: string | null }
  type Row = { entry_id: number; script: string; ids: string | null; description: string | null; evidence_id: number; place: string; title: string | null; year: string | null; page: string | null; note: string | null; has_image: number }
  let { data }: { data: { locale: Locale; source: Source; rows: Row[]; next: number | null } } = $props()
  const heading = $derived(data.source.title || data.source.place || t(data.locale, 'source.title'))
</script>

<svelte:head><title>{heading} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="page-heading">
    <p class="eyebrow">{t(data.locale, 'source.title')}</p>
    <h1>{heading}</h1>
    <p>{t(data.locale, 'source.intro')}</p>
    <dl class="entry-meta">
      {#if data.source.author}<div class="entry-row"><dt>{t(data.locale, 'field.author')}</dt><dd>{data.source.author}</dd></div>{/if}
      {#if data.source.publisher}<div class="entry-row"><dt>{t(data.locale, 'field.publisher')}</dt><dd>{data.source.publisher}</dd></div>{/if}
      {#if data.source.year}<div class="entry-row"><dt>{t(data.locale, 'field.year')}</dt><dd>{data.source.year}</dd></div>{/if}
      {#if data.source.place}<div class="entry-row"><dt>{t(data.locale, 'field.place')}</dt><dd>{data.source.place}</dd></div>{/if}
    </dl>
  </header>
  <section>
    <h2 class="section-label">{t(data.locale, 'entry.sightings')}</h2>
    <div class="entry-list">
      {#each data.rows as row (row.evidence_id)}
        <a class="entry-card" href={localizedHref(data.locale, `/entry/${row.entry_id}`)}>
          <span class="glyph">{primaryIds(row.ids) || row.script}</span>
          {#if row.description}<span class="description">{row.description}</span>{/if}
          <span class="place">{row.place}{#if row.year} · {row.year}{/if}{#if row.page} · {t(data.locale, 'field.page')} {row.page}{/if}</span>
          <span class="record">#{row.entry_id}</span>
        </a>
      {/each}
    </div>
    {#if data.next}<p><a class="text-link" href={`?before=${data.next}`}>{t(data.locale, 'browse.more')}</a></p>{/if}
  </section>
</div>
