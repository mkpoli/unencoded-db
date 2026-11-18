<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { t, href } from '$lib/t'
  import ChatLinks from '$lib/components/ChatLinks.svelte'

</script>

<Seo title={t('about.title')} />
<div class="page narrow stack">
  <h1>{t('about.title')}</h1>
  <p>{t('about.what')}</p>
  <section class="stack"><h2>{t('about.howTitle')}</h2><p>{t('about.how')}</p></section>
  <section class="stack">
    <h2>{t('about.dataTitle')}</h2>
    <p>{t('about.data')}</p>
    <div class="row">
      <a class="text-link" href={href('/data')}>{t('data.title')}</a>
      <a class="text-link" href="/api/export?format=json">{t('about.apiJson')}</a>
      <a class="text-link" href="/api/export?format=csv">{t('about.apiCsv')}</a>
      <a class="text-link" href={href('/fonts')}>{t('about.fontDownload')}</a>
    </div>
  </section>
  <section class="stack">
    <h2>{t('footer.community')}</h2>
    <p><ChatLinks /></p>
  </section>
</div>
