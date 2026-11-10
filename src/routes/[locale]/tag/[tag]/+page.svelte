<script lang="ts">
  import { primaryIds } from '$lib/ids'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  let { data }: { data: { locale: Locale; tag: string; entries: { id: number; script: string; ids: string | null; description: string | null }[] } } = $props()
</script>

<svelte:head><title>{data.tag} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="page-heading"><p class="eyebrow">{t(data.locale, 'field.tags')}</p><h1>{data.tag}</h1></header>
  {#if data.entries.length}
    <div class="entry-list">
      {#each data.entries as entry (entry.id)}
        <a class="entry-card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
          <span class="glyph">{primaryIds(entry.ids) || entry.script}</span>
          {#if entry.description}<span class="description">{entry.description}</span>{/if}
          <span class="record">#{entry.id}</span>
        </a>
      {/each}
    </div>
  {:else}
    <p class="empty">{t(data.locale, 'browse.emptyAll')}</p>
  {/if}
</div>
