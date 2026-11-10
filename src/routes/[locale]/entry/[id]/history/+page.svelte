<script lang="ts">
  import { splitIds } from '$lib/ids'
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type FieldName = 'script' | 'ids' | 'description' | 'place' | 'title' | 'author' | 'publisher' | 'year' | 'page' | 'note'
  type Revision = { entry_id: number; revision: number; recorded_at: string } & ({ tombstone: true } | ({ tombstone: false } & Record<FieldName, string | null>))
  let { data }: { data: { locale: Locale; id: number; revisions: Revision[]; next: number | null } } = $props()
</script>

<svelte:head><title>{t(data.locale, 'entry.history')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <a class="back-link" href={localizedHref(data.locale, `/entry/${data.id}`)}>← {t(data.locale, 'entry.record', { id: data.id })}</a>
  <div class="page-heading">
    <h1>{t(data.locale, 'entry.history')}</h1>
  </div>
  <div class="related-list">
    {#each data.revisions as revision}
      <article class="related-card revision-card">
        <h2>{t(data.locale, 'history.revision', { n: revision.revision })}</h2>
        {#if revision.tombstone}
          <p class="notice">{t(data.locale, 'history.redacted')}</p>
          <p class="revision-date">{formatDate(data.locale, revision.recorded_at)}</p>
        {:else}
          <dl class="entry-meta">
            <div class="entry-row"><dt>{t(data.locale, 'field.script')}</dt><dd>{revision.script}</dd></div>
            {#if revision.ids}<div class="entry-row"><dt>{t(data.locale, 'field.ids')}</dt><dd>{splitIds(revision.ids).join(' · ')}</dd></div>{/if}
            {#if revision.description}<div class="entry-row"><dt>{t(data.locale, 'field.description')}</dt><dd>{revision.description}</dd></div>{/if}
            <div class="entry-row"><dt>{t(data.locale, 'field.place')}</dt><dd>{revision.place}</dd></div>
            {#if revision.title}<div class="entry-row"><dt>{t(data.locale, 'field.title')}</dt><dd>{revision.title}</dd></div>{/if}
            {#if revision.author}<div class="entry-row"><dt>{t(data.locale, 'field.author')}</dt><dd>{revision.author}</dd></div>{/if}
            {#if revision.publisher}<div class="entry-row"><dt>{t(data.locale, 'field.publisher')}</dt><dd>{revision.publisher}</dd></div>{/if}
            {#if revision.year}<div class="entry-row"><dt>{t(data.locale, 'field.year')}</dt><dd>{revision.year}</dd></div>{/if}
            {#if revision.page}<div class="entry-row"><dt>{t(data.locale, 'field.page')}</dt><dd>{revision.page}</dd></div>{/if}
            {#if revision.note}<div class="entry-row"><dt>{t(data.locale, 'field.note')}</dt><dd>{revision.note}</dd></div>{/if}
            <div class="entry-row"><dt>{t(data.locale, 'history.recorded')}</dt><dd>{formatDate(data.locale, revision.recorded_at)}</dd></div>
          </dl>
        {/if}
      </article>
    {/each}
  </div>
  {#if data.next}
    <div class="more-row"><a class="secondary" href="?before={data.next}">{t(data.locale, 'history.older')} →</a></div>
  {/if}
</div>
