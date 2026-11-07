<script lang="ts">
  let { data } = $props()
  const reasonLabels: Record<string, string> = { spam: 'Spam', privacy: 'Privacy', rights: 'Copyright', other: 'Other' }
  function reasonLabel(reason: string): string { return reasonLabels[reason] ?? reason }
</script>
<svelte:head><title>Reports · 珍字集覽</title></svelte:head>
<div class="page-heading">
  <h1>Open reports</h1>
  <p>Signed in as {data.moderator}. Reports are anonymous. Hiding an entry resolves its open reports.</p>
</div>
<p><a href="/moderate">← Hidden entries</a></p>
{#if data.reports.length}
  <ul class="queue">
    {#each data.reports as report}
      <li class="panel queue-item">
        <div class="queue-meta"><span>Report #{report.report_id}</span><time datetime={report.created_at}>{report.created_at}</time></div>
        <h2>{report.script}</h2>
        <p><strong>{reasonLabel(report.reason)}</strong></p>
        {#if report.note}<p class="queue-description">{report.note}</p>{/if}
        <p class="queue-place"><a href="/entry/{report.entry_id}">#{report.entry_id}</a> · {report.place}</p>
        <form method="POST" action="/moderate/{report.entry_id}/hide">
          <button type="submit">Hide entry</button>
        </form>
      </li>
    {/each}
  </ul>
  {#if data.next}<p><a href="/moderate/reports?before={data.next}">Older reports →</a></p>{/if}
{:else}
  <p class="notice">No open reports.</p>
{/if}
