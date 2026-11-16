<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { locale, t } from '$lib/t'
  import { CHATS, contactPage } from '$lib/community'
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
  <section class="stack">
    <h2>{t('footer.community')}</h2>
    <div class="row">{#each CHATS as chat (chat.name)}<a class="text-link" href={chat.href} target="_blank" rel="noopener">{chat.name}</a>{/each}<a class="text-link" href={contactPage(locale())} target="_blank" rel="noopener">{t('footer.contact')}</a></div>
  </section>
</div>
