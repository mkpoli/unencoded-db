<script lang="ts">
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Entry = { id: number; script: string; ids: string | null; description: string | null; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string; has_image: number }
  let { data }: { data: { locale: Locale; entry: Entry } } = $props()
  let entry = $derived(data.entry)
</script>

<svelte:head><title>{t(data.locale, 'entry.record', { id: entry.id })} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="entry-header">
    <p class="eyebrow">{t(data.locale, 'entry.record', { id: entry.id })}</p>
    <h1>{entry.ids || entry.script}</h1>
  </header>
  {#if entry.has_image}
    <figure class="entry-figure">
      <img src={localizedHref(data.locale, `/entry/${entry.id}/image`)} alt={entry.description || t(data.locale, 'field.sourceImage')} />
    </figure>
  {/if}
  <dl class="entry-meta">
    <div class="entry-row"><dt>{t(data.locale, 'field.script')}</dt><dd>{entry.script}</dd></div>
    {#if entry.ids}<div class="entry-row"><dt>{t(data.locale, 'field.ids')}</dt><dd>{entry.ids}</dd></div>{/if}
    {#if entry.description}<div class="entry-row"><dt>{t(data.locale, 'field.description')}</dt><dd>{entry.description}</dd></div>{/if}
    <div class="entry-row"><dt>{t(data.locale, 'field.place')}</dt><dd>{entry.place}</dd></div>
    {#if entry.title}<div class="entry-row"><dt>{t(data.locale, 'field.title')}</dt><dd>{entry.title}</dd></div>{/if}
    {#if entry.author}<div class="entry-row"><dt>{t(data.locale, 'field.author')}</dt><dd>{entry.author}</dd></div>{/if}
    {#if entry.publisher}<div class="entry-row"><dt>{t(data.locale, 'field.publisher')}</dt><dd>{entry.publisher}</dd></div>{/if}
    {#if entry.year}<div class="entry-row"><dt>{t(data.locale, 'field.year')}</dt><dd>{entry.year}</dd></div>{/if}
    {#if entry.page}<div class="entry-row"><dt>{t(data.locale, 'field.page')}</dt><dd>{entry.page}</dd></div>{/if}
    {#if entry.note}<div class="entry-row"><dt>{t(data.locale, 'field.note')}</dt><dd>{entry.note}</dd></div>{/if}
    <div class="entry-row"><dt>{t(data.locale, 'entry.added')}</dt><dd>{formatDate(data.locale, entry.created_at)}</dd></div>
  </dl>
</div>
