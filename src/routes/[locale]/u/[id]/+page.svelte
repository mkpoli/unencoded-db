<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { day, t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('person.title', { name: data.person.name })} />
<div class="page narrow stack">
  <div class="stack intro">
    <h1>{t('person.title', { name: data.person.name })}</h1>
    <p class="muted small">{t('person.since', { date: day(data.person.created_at) })}</p>
  </div>
  <HistoryList rows={data.rows} showEntry showActor={false} empty={t('person.empty')} next={data.next} />
</div>

<style>
  .intro { gap: 4px }
</style>
