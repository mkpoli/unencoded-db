<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'

  let { data }: { data: { locale: Locale; entries: { id: number; script: string; ids: string | null; place: string }[]; next: number | null } } = $props()
</script>

<svelte:head><title>{t(data.locale, 'app.name')}</title></svelte:head>
<div class="page-heading">
  <h1>{t(data.locale, 'app.name')}</h1>
  <p>{t(data.locale, 'app.tagline')}</p>
</div>
{#if data.entries.length}
  <div class="card-grid">
    {#each data.entries as entry}
      <a class="entry-card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
        <span class="glyph">{entry.ids || entry.script}</span>
        <span class="place">{entry.place}</span>
        <span class="record">#{entry.id}</span>
      </a>
    {/each}
  </div>
  {#if data.next}
    <div class="more-row">
      <a class="secondary" href={`${localizedHref(data.locale)}?before=${data.next}`}>{t(data.locale, 'browse.more')} →</a>
    </div>
  {/if}
{:else}
  <div class="empty-state">
    <span class="empty-mark" aria-hidden="true">字</span>
    <p>{t(data.locale, 'browse.emptyAll')}</p>
    <a class="primary" href={localizedHref(data.locale, '/new')}>{t(data.locale, 'browse.addOne')} <span aria-hidden="true">→</span></a>
  </div>
{/if}
