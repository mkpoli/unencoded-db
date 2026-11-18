<script lang="ts">
  import { page } from '$app/state'
  import { onDestroy } from 'svelte'
  import { t } from '$lib/t'

  let { id }: { id: number } = $props()
  const url = $derived(new URL(`/r/${id}`, page.url.origin).href)
  const labelId = $props.id()
  let dialog: HTMLDialogElement
  let field: HTMLInputElement
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  async function share() {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ url }))) {
      try {
        await navigator.share({ url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => copied = false, 2000)
    } catch {
      dialog.showModal()
      field.select()
    }
  }
</script>

<span class="share">
  <button type="button" class="button" onclick={share}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
    {t('entry.share')}
  </button>
  <span class="feedback" role="status">{copied ? t('entry.copied') : ''}</span>
</span>

<dialog bind:this={dialog} aria-labelledby={labelId}>
  <label class="field" id={labelId}>
    {t('entry.shareLink')}
    <input class="input" type="url" readonly value={url} bind:this={field} />
  </label>
  <form method="dialog"><button class="button">{t('spelling.close')}</button></form>
</dialog>

<style>
  .share { position:relative; display:inline-flex }
  .feedback { position:absolute; inset-block-start:calc(100% + 4px); inset-inline-end:0; z-index:1; white-space:nowrap }
  .feedback:not(:empty) { padding:4px 8px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:6px }
  dialog { width:min(26rem, calc(100vw - 2rem)); padding:20px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px }
  dialog::backdrop { background:var(--backdrop) }
  form { display:flex; justify-content:end; margin-block-start:12px }
</style>
