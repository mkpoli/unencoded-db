<script lang="ts">
  import RevisionHistory from '$lib/components/RevisionHistory.svelte'
  import type { RevisionSnapshot } from '$lib/revision'
  import { localizedHref, t, type Locale } from '$lib/i18n'

  let { data }: { data: { locale: Locale; id: number; revisions: RevisionSnapshot[]; next: number | null } } = $props()
</script>

<svelte:head><title>{t(data.locale, 'entry.history')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <a class="back-link" href={localizedHref(data.locale, `/entry/${data.id}`)}>← {t(data.locale, 'entry.record', { id: data.id })}</a>
  <div class="page-heading">
    <h1>{t(data.locale, 'entry.history')}</h1>
  </div>
  <RevisionHistory locale={data.locale} revisions={data.revisions} />
  {#if data.next}
    <div class="more-row"><a class="secondary" href="?before={data.next}">{t(data.locale, 'history.older')} →</a></div>
  {/if}
</div>
