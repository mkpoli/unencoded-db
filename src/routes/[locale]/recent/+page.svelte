<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t, when } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('recent.title')} />
<div class="page narrow stack">
  <h1>{t('recent.title')}</h1>
  {#if !data.rows.length && !data.next}<p class="muted">{t('recent.empty')}</p>{/if}
  <ol class="changes">
    {#each data.rows as row (row.id)}
      <li>
        <div><a class="text-link" href={href(`/entry/${row.entry_id}`)}>{row.ids || t('entry.record', { id: row.entry_id })}</a> · {t(`history.kind.${row.kind}`)}</div>
        <div class="muted small">{row.by_name} · <time datetime={row.at}>{when(row.at)}</time></div>
        {#if row.summary}<p>{row.summary}</p>{/if}
      </li>
    {/each}
  </ol>
  {#if data.next}<div><a class="button" href="?before={data.next}">{t('recent.older')}</a></div>{/if}
</div>

<style>
  .changes { list-style: none; padding: 0; margin: 0 }
  .changes li { padding: 12px 0; border-bottom: 1px solid var(--line) }
</style>
