<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'
  let { data }: { data: { locale: Locale; genre: { slug: string; label: string }; genres?: { slug: string; label: string }[]; entries: { id: number; script: string; ids: string | null; description: string | null }[] } } = $props()
</script>

<svelte:head><title>{data.genre.label} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="page">
  <a class="back-link" href={localizedHref(data.locale)}>← {t(data.locale, 'nav.browse')}</a>
  <header class="page-heading">
    <p class="eyebrow">{t(data.locale, 'field.genre')}</p>
    <h1>{data.genre.label}</h1>
    {#if data.genres?.length}
      <p class="genre-list">
        {#each data.genres as item (item.slug)}
          <a class="genre-chip" aria-current={item.slug === data.genre.slug ? 'page' : undefined} href={localizedHref(data.locale, `/genre/${item.slug}`)}>{item.label}</a>
        {/each}
      </p>
    {/if}
  </header>
  {#if data.entries.length}
    <div class="entry-list">
      {#each data.entries as entry (entry.id)}
        <a class="entry-card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
          <span class="glyph">{entry.ids || entry.script}</span>
          {#if entry.description}<span class="description">{entry.description}</span>{/if}
          <span class="record">#{entry.id}</span>
        </a>
      {/each}
    </div>
  {:else}
    <p class="empty">{t(data.locale, 'browse.emptyAll')}</p>
  {/if}
</div>
