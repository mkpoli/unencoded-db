<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t, when } from '$lib/t'
  let { data } = $props()
  function more(name: keyof typeof data.cursors, value: number) {
    const cursors = { ...data.cursors, [name]: value }
    const params = new URLSearchParams()
    for (const [key, cursor] of Object.entries(cursors)) if (cursor !== null) params.set(key, String(cursor))
    return href(`/moderate?${params}`)
  }
</script>

<Seo title={t('moderate.title')} />
<div class="page narrow stack">
  <h1>{t('moderate.title')}</h1>
  {#if !data.reports.length}<p class="muted">{t('moderate.empty')}</p>{/if}
  <ol class="reports">
    {#each data.reports as report (report.id)}
      <li>
        <div><a class="text-link" href={href(`/entry/${report.entry_id}`)}>{report.ids || t('entry.record', { id: report.entry_id })}</a>{#if report.sighting_id} · {t('entry.sightings')} #{report.sighting_id}{/if}</div>
        <div class="muted small">{report.by_name} · <time datetime={report.at}>{when(report.at)}</time></div>
        <p class="reason">{report.reason}</p>
        <form method="POST" action={report.target_hidden_at ? '?/unhide' : '?/hide'}>
          <input type="hidden" name="report" value={report.id} />
          <button class="button" type="submit">{t(report.sighting_id ? (report.target_hidden_at ? 'moderate.unhideSighting' : 'moderate.hideSighting') : (report.target_hidden_at ? 'moderate.unhide' : 'moderate.hide'))}</button>
        </form>
        <form method="POST" action="?/resolve">
          <input type="hidden" name="report" value={report.id} />
          <button class="button" type="submit">{t('moderate.resolve')}</button>
        </form>
      </li>
    {/each}
  </ol>
  {#if data.nextReports}<a class="text-link" href={more('reportsAfter', data.nextReports)}>{t('browse.more')}</a>{/if}
  <section>
    <h2>{t('moderate.hiddenEntries')}</h2>
    <ol class="reports">
      {#each data.hiddenEntries as entry (entry.id)}
        <li>
          <div>{entry.ids || t('entry.record', { id: entry.id })} · #{entry.id} · <time datetime={entry.hidden_at}>{when(entry.hidden_at)}</time></div>
          <form method="POST" action="?/restoreEntry"><input type="hidden" name="id" value={entry.id} /><button class="button" type="submit">{t('moderate.unhide')}</button></form>
        </li>
      {/each}
    </ol>
    {#if data.nextEntries}<a class="text-link" href={more('entriesBefore', data.nextEntries)}>{t('browse.more')}</a>{/if}
  </section>
  <section>
    <h2>{t('moderate.hiddenSightings')}</h2>
    <ol class="reports">
      {#each data.hiddenSightings as sighting (sighting.id)}
        <li>
          <div>{sighting.ids || t('entry.record', { id: sighting.entry_id })} · #{sighting.entry_id} · {t('entry.sightings')} #{sighting.id} · {#if sighting.place}{sighting.place} · {/if}<time datetime={sighting.hidden_at}>{when(sighting.hidden_at)}</time></div>
          <form method="POST" action="?/restoreSighting"><input type="hidden" name="id" value={sighting.id} /><button class="button" type="submit">{t('moderate.unhideSighting')}</button></form>
        </li>
      {/each}
    </ol>
    {#if data.nextSightings}<a class="text-link" href={more('sightingsBefore', data.nextSightings)}>{t('browse.more')}</a>{/if}
  </section>
</div>

<style>
  .reports { list-style: none; padding: 0; margin: 0 }
  .reports li { padding: 12px 0; border-bottom: 1px solid var(--line) }
  .reason { white-space: pre-wrap; overflow-wrap: anywhere }
</style>
