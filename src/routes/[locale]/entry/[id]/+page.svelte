<script lang="ts">
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Entry = { id: number; script: string; ids: string | null; description: string | null; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; created_at: string; has_image: number }
  let { data }: { data: { locale: Locale; entry: Entry } } = $props()
  let entry = $derived(data.entry)
</script>

<svelte:head><title>{t(data.locale, 'entry.record', { id: entry.id })} · {t(data.locale, 'app.name')}</title></svelte:head>
<p><a href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a></p>
<h1>{entry.ids || entry.script}</h1>
{#if entry.has_image}
  <figure class="source-image">
    <img src={localizedHref(data.locale, `/entry/${entry.id}/image`)} alt={entry.description || t(data.locale, 'field.sourceImage')} />
  </figure>
{/if}
<dl>
  <dt>{t(data.locale, 'field.script')}</dt><dd>{entry.script}</dd>
  {#if entry.ids}<dt>{t(data.locale, 'field.ids')}</dt><dd>{entry.ids}</dd>{/if}
  {#if entry.description}<dt>{t(data.locale, 'field.description')}</dt><dd>{entry.description}</dd>{/if}
  <dt>{t(data.locale, 'field.place')}</dt><dd>{entry.place}</dd>
  {#if entry.title}<dt>{t(data.locale, 'field.title')}</dt><dd>{entry.title}</dd>{/if}
  {#if entry.author}<dt>{t(data.locale, 'field.author')}</dt><dd>{entry.author}</dd>{/if}
  {#if entry.publisher}<dt>{t(data.locale, 'field.publisher')}</dt><dd>{entry.publisher}</dd>{/if}
  {#if entry.year}<dt>{t(data.locale, 'field.year')}</dt><dd>{entry.year}</dd>{/if}
  {#if entry.page}<dt>{t(data.locale, 'field.page')}</dt><dd>{entry.page}</dd>{/if}
  {#if entry.note}<dt>{t(data.locale, 'field.note')}</dt><dd>{entry.note}</dd>{/if}
  <dt>{t(data.locale, 'entry.added')}</dt><dd>{formatDate(data.locale, entry.created_at)}</dd>
</dl>
