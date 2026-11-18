<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { t } from '$lib/t'
  import ChatLinks from '$lib/components/ChatLinks.svelte'

  let busy = $state(false), status = $state('')
  async function download() {
    busy = true
    status = t('about.fontPreparing')
    try {
      const { exportFonts } = await import('$lib/font-export')
      const blob = await exportFonts((done, total) => { status = done + ' / ' + total })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'RareCharacterCompendium-PUA.zip'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      status = ''
    } catch {
      status = t('about.fontError')
    } finally {
      busy = false
    }
  }
</script>

<Seo title={t('about.title')} />
<div class="page narrow stack">
  <h1>{t('about.title')}</h1>
  <p>{t('about.what')}</p>
  <section class="stack"><h2>{t('about.howTitle')}</h2><p>{t('about.how')}</p></section>
  <section class="stack">
    <h2>{t('about.dataTitle')}</h2>
    <p>{t('about.data')}</p>
    <div class="row"><a class="text-link" href="/api/entries">JSON</a><a class="text-link" href="/api/entries?format=csv">CSV</a><button class="text-link" disabled={busy} onclick={download}>{t('about.fontDownload')}</button></div>
    <span role="status">{status}</span>
  </section>
  <section class="stack">
    <h2>{t('footer.community')}</h2>
    <p><ChatLinks /></p>
  </section>
</div>
