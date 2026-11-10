<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('recent.title')} />
<div class="page narrow stack">
  <h1>{t('recent.title')}</h1>
  <HistoryList rows={data.rows} showEntry empty={t('recent.empty')} next={data.next} />
</div>
