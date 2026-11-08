<script lang="ts">
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Entry = { id: number; script: string; description: string | null; place: string; created_at: string }
  let { data }: { data: { locale: Locale; entries: Entry[]; next: number | null; moderator: string } } = $props()
</script>

<svelte:head><title>{t(data.locale, 'moderate.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="page-heading">
  <p class="eyebrow">{t(data.locale, 'moderate.eyebrow')}</p>
  <h1>{t(data.locale, 'moderate.title')}</h1>
  <p>{t(data.locale, 'moderate.intro', { email: data.moderator })}</p>
  <p><a href={localizedHref(data.locale, '/moderate/reports')}>{t(data.locale, 'moderate.reports')}</a></p>
</div>
{#if data.entries.length}
  <div class="card-grid">
    {#each data.entries as entry}
      <article class="entry-card queue-card">
        <span class="glyph">{entry.script}</span>
        <span class="place">{entry.place}</span>
        {#if entry.description}<p class="description">{entry.description}</p>{/if}
        <span class="record">{t(data.locale, 'entry.record', { id: entry.id })} · {t(data.locale, 'entry.added')} {formatDate(data.locale, entry.created_at)}</span>
        <form class="entry-actions" method="POST" action={localizedHref(data.locale, `/moderate/${entry.id}/restore`)}>
          <button class="secondary" type="submit">{t(data.locale, 'moderate.restore')}</button>
        </form>
      </article>
    {/each}
  </div>
  {#if data.next}
    <div class="more-row">
      <a class="secondary" href={`${localizedHref(data.locale, '/moderate')}?before=${data.next}`}>{t(data.locale, 'moderate.older')} →</a>
    </div>
  {/if}
{:else}
  <div class="empty-state">
    <span class="empty-mark" aria-hidden="true">字</span>
    <p>{t(data.locale, 'moderate.empty')}</p>
  </div>
{/if}
