<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'

  let { data }: { data: { locale: Locale; entries: { id: number; script: string; ids: string | null; place: string }[]; next: number | null } } = $props()
</script>

<svelte:head><title>{t(data.locale, 'app.name')}</title></svelte:head>
<h1>{t(data.locale, 'app.name')}</h1>
<p>{t(data.locale, 'app.tagline')}</p>
{#if data.entries.length}
  <div class="grid">
    {#each data.entries as entry}
      <a class="card" href={localizedHref(data.locale, `/entry/${entry.id}`)}>
        <strong>{entry.ids || entry.script}</strong><br />{entry.place}
      </a>
    {/each}
  </div>
  {#if data.next}<p><a href={`${localizedHref(data.locale)}?before=${data.next}`}>{t(data.locale, 'browse.more')} →</a></p>{/if}
{:else}
  <p class="empty">{t(data.locale, 'browse.emptyAll')}<a href={localizedHref(data.locale, '/new')}>{t(data.locale, 'browse.addOne')}</a></p>
{/if}

<style>
  .empty a { margin-left: .4em; }
</style>
