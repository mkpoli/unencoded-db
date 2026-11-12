<script lang="ts">
  // The buttons that end a form. With `sticky`, they stay at the foot of the window while the form is longer
  // than it, and the terms stand above them. While `busy`, a picture is still being prepared: the button
  // says so and holds the form back.
  import { page } from '$app/state'
  import { t } from '$lib/t'

  let { busy = false, label, cancel, sticky = false }: { busy?: boolean; label?: string; cancel?: string; sticky?: boolean } = $props()
  const name = $derived((page.data as { person?: { name: string } | null }).person?.name)
</script>

{#snippet terms()}<p class="hint">{#if name}{t('form.as', { name })}{' '}{/if}{t('form.terms')}</p>{/snippet}

{#if sticky}{@render terms()}{/if}
<div class="bar" class:sticky>
  <button type="submit" class="button primary" aria-disabled={busy} onclick={event => { if (busy) event.preventDefault() }}>{busy ? t('field.imageWorking') : label ?? t('form.save')}</button>
  {#if cancel}<a class="button" href={cancel}>{t('form.cancel')}</a>{/if}
  {#if !sticky}{@render terms()}{/if}
</div>

<style>
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px }
  .bar p { flex: 1 1 260px; min-width: 0 }
  .button[aria-disabled=true] { opacity: .5; cursor: default }
  /* Nothing scrolled into view comes to rest under the bar. */
  :global(html):has(.sticky) { scroll-padding-block-end: 84px }
  /* Wide enough to cover the focus rings of what scrolls under it. */
  .sticky { position: sticky; inset-block-end: 0; z-index: 2; margin-inline: -6px; padding: 12px 6px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--paper) }
</style>
