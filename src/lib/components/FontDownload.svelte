<script lang="ts">
  import { t } from '$lib/t'
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

<div class="row">
  <button type="button" class="button primary" disabled={busy} onclick={download}>{t('fonts.download')}</button>
  <span role="status">{status}</span>
</div>
