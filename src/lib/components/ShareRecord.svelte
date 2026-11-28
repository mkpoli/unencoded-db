<script lang="ts">
  import { onDestroy } from 'svelte'
  import { shortShareUrl } from '$lib/short-record'
  import { t } from '$lib/t'

  let { id }: { id: number } = $props()
  const url = $derived(shortShareUrl(id))
  const labelId = $props.id()
  let dialog: HTMLDialogElement
  let field: HTMLInputElement
  let nativeShare = $state(false)
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  function openShare() {
    nativeShare = !!navigator.share && (!navigator.canShare || navigator.canShare({ url }))
    if (nativeShare) dialog.showModal()
    else void copyLink()
  }

  async function share() {
    try {
      await navigator.share({ url })
      dialog.close()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) field.select()
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      if (dialog.open) dialog.close()
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => copied = false, 2000)
    } catch {
      if (!dialog.open) dialog.showModal()
      field.select()
    }
  }
</script>

<span class="share">
  <button type="button" class="button" onclick={openShare}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
    {t('entry.share')}
  </button>
  <span class="feedback" role="status">{copied ? t('entry.copied') : ''}</span>
</span>

<dialog bind:this={dialog} aria-labelledby={labelId}>
  <label class="field">
    <span id={labelId}>{t('entry.shareLink')}</span>
    <input class="input" type="url" readonly value={url} bind:this={field} />
  </label>
  <form method="dialog" class="row">
    <button class="button">{t('spelling.close')}</button>
    <button type="button" class="button" onclick={copyLink}>{t('entry.copy')}</button>
    {#if nativeShare}<button type="button" class="button primary" onclick={share}>{t('entry.share')}</button>{/if}
  </form>
</dialog>

<style>
  .share { position:relative; display:inline-flex }
  .feedback { position:absolute; inset-block-start:calc(100% + 4px); inset-inline-end:0; z-index:1; white-space:nowrap }
  .feedback:not(:empty) { padding:4px 8px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:6px }
  dialog { width:min(26rem, calc(100vw - 2rem)); padding:20px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px }
  dialog::backdrop { background:var(--backdrop) }
  form { display:flex; justify-content:end; margin-block-start:12px }
</style>
