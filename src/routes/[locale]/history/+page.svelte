<script lang="ts">
  import RevisionHistory from '$lib/components/RevisionHistory.svelte'
  import type { RevisionSnapshot } from '$lib/revision'
  import { t, type Locale } from '$lib/i18n'

  type Next = { recorded_at: string; entry_id: number; revision: number }
  let { data }: { data: { locale: Locale; revisions: RevisionSnapshot[]; next: Next | null } } = $props()
  const nextHref = $derived(data.next
    ? `?before=${encodeURIComponent(data.next.recorded_at)}&entry=${data.next.entry_id}&revision=${data.next.revision}`
    : null)
</script>

<svelte:head><title>{t(data.locale, 'history.all')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="entry-page">
  <div class="page-heading">
    <h1>{t(data.locale, 'history.all')}</h1>
  </div>
  {#if !data.revisions.length}<p class="notice">{t(data.locale, 'history.empty')}</p>{/if}
  <RevisionHistory locale={data.locale} revisions={data.revisions} showEntry />
  {#if nextHref}
    <div class="more-row"><a class="secondary" href={nextHref}>{t(data.locale, 'history.older')} →</a></div>
  {/if}
</div>
