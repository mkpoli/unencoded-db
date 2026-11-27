<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('history.globalTitle')} />
<div class="page narrow stack">
  <h1>{t('history.globalTitle')}</h1>
  <nav class="by" aria-label={t('history.by')}>
    {#each [[null, 'history.byAll'], ['person', 'history.byPeople'], ['agent', 'history.byAgents']] as const as [by, label] (label)}
      <a class="chip" class:on={data.by === by} aria-current={data.by === by ? 'page' : undefined} href={by ? `?by=${by}` : '?'}>{t(label)}</a>
    {/each}
  </nav>
  <HistoryList dates={data.dates} rows={data.rows} tags={data.tags} showEntry empty={t('history.empty')} next={data.next} query={data.by ? `by=${data.by}&` : ''} />
</div>

<style>
  .by { display: flex; flex-wrap: wrap; gap: 4px }
</style>
