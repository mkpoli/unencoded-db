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
      <a class="chip" class:on={data.by === by} aria-current={data.by === by ? 'page' : undefined} href={`?${by ? `by=${by}` : ''}${data.flat ? `${by ? '&' : ''}flat=1` : ''}`}>{t(label)}</a>
    {/each}
    <a class="chip every" class:on={data.flat} aria-current={data.flat ? 'true' : undefined} href={`?${data.by ? `by=${data.by}` : ''}${data.flat ? '' : `${data.by ? '&' : ''}flat=1`}`}>{t('history.every')}</a>
  </nav>
  <HistoryList dates={data.dates} items={data.items} newer={data.newer} paged={data.paged} tags={data.tags} showEntry empty={t('history.empty')} next={data.older} query={`${data.by ? `by=${data.by}&` : ''}${data.flat ? 'flat=1&' : ''}`} />
</div>

<style>
  .by { display: flex; flex-wrap: wrap; gap: 4px }
  .every { margin-inline-start: auto }
</style>
