<script lang="ts">
  import { formatDate, localizedHref, t, type Locale } from '$lib/i18n'

  type Report = {
    report_id: number
    reason: string
    note: string
    created_at: string
    entry_id: number
    script: string
    description: string | null
    place: string
  }
  let { data }: { data: { locale: Locale; reports: Report[]; next: number | null; moderator: string } } = $props()

  function reasonLabel(locale: Locale, reason: string): string {
    if (reason === 'spam') return t(locale, 'report.reason.spam')
    if (reason === 'privacy') return t(locale, 'report.reason.privacy')
    if (reason === 'rights') return t(locale, 'report.reason.rights')
    return t(locale, 'report.reason.other')
  }
</script>

<svelte:head><title>{t(data.locale, 'reports.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<a class="back-link" href={localizedHref(data.locale, '/moderate')}>← {t(data.locale, 'reports.back')}</a>
<div class="page-heading">
  <p class="eyebrow">{t(data.locale, 'reports.eyebrow')}</p>
  <h1>{t(data.locale, 'reports.title')}</h1>
  <p>{t(data.locale, 'reports.intro', { email: data.moderator })}</p>
</div>
{#if data.reports.length}
  <div class="card-grid">
    {#each data.reports as report (report.report_id)}
      <article class="entry-card queue-card">
        <span class="eyebrow">{reasonLabel(data.locale, report.reason)}</span>
        <span class="glyph">{report.script}</span>
        {#if report.description}<p class="description">{report.description}</p>{/if}
        {#if report.note}<p class="description report-note">{report.note}</p>{/if}
        <span class="place">{report.place}</span>
        <span class="record">
          <a href={localizedHref(data.locale, `/entry/${report.entry_id}`)}>{t(data.locale, 'entry.record', { id: report.entry_id })}</a>
          · {t(data.locale, 'reports.record', { id: report.report_id })} · {formatDate(data.locale, report.created_at)}
        </span>
        <form class="entry-actions" method="POST" action={localizedHref(data.locale, `/moderate/${report.entry_id}/hide`)}>
          <button class="secondary" type="submit">{t(data.locale, 'moderate.hide')}</button>
        </form>
      </article>
    {/each}
  </div>
  {#if data.next}
    <div class="more-row">
      <a class="secondary" href={`${localizedHref(data.locale, '/moderate/reports')}?before=${data.next}`}>{t(data.locale, 'reports.older')} →</a>
    </div>
  {/if}
{:else}
  <div class="empty-state">
    <span class="empty-mark" aria-hidden="true">字</span>
    <p>{t(data.locale, 'reports.empty')}</p>
  </div>
{/if}
