<script lang="ts">
  // Copies a text to the clipboard and confirms it for a moment.
  import { t } from '$lib/t'
  let { text, label = '' }: { text: string; label?: string } = $props()
  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try { await navigator.clipboard.writeText(text) } catch { return }
    copied = true
    clearTimeout(timer)
    timer = setTimeout(() => copied = false, 1500)
  }
</script>

<button type="button" class="copy" class:copied onclick={copy} aria-label="{t('entry.copy')} {label || text}" title={t('entry.copy')}>
  {#if copied}
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>
  {/if}
  <span class="sr-only" aria-live="polite">{copied ? t('entry.copied') : ''}</span>
</button>

<style>
  .copy { display:inline-grid; place-items:center; flex:none; width:28px; height:28px; padding:0; border:1px solid transparent; border-radius:6px; background:none; color:var(--muted); cursor:pointer; vertical-align:middle }
  .copy:hover, .copy:focus-visible { border-color:var(--line); color:var(--text) }
  .copy.copied { color:var(--good, var(--text)) }
</style>
