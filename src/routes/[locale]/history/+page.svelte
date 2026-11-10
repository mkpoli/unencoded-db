<script lang="ts">
  import HistoryList from '$lib/components/HistoryList.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
  let { data } = $props()
</script>

<Seo title={t('history.globalTitle')} />
<div class="page narrow stack">
  <h1>{t('history.globalTitle')}</h1>
  <HistoryList rows={data.rows} showEntry empty={t('history.empty')} next={data.next} />
</div>
