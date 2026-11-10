<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
</script>

<Seo title={t('about.title')} />
<div class="page narrow stack">
  <h1>{t('about.title')}</h1>
  <p>{t('about.what')}</p>
  <section class="stack"><h2>{t('about.howTitle')}</h2><p>{t('about.how')}</p></section>
  <section class="stack">
    <h2>{t('about.dataTitle')}</h2>
    <p>{t('about.data')}</p>
    <div class="row"><a class="text-link" href="/api/entries">JSON</a><a class="text-link" href="/api/entries?format=csv">CSV</a></div>
  </section>
</div>
