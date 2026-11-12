<script lang="ts">
  import { page } from '$app/state'
  import { t } from '$lib/t'

  let { busy = false, label, cancel }: { busy?: boolean; label?: string; cancel?: string } = $props()
  const name = $derived((page.data as { person?: { name: string } | null }).person?.name)
</script>

<div class="bar">
  <button class="button primary" disabled={busy}>{busy ? t('form.saving') : label ?? t('form.save')}</button>
  {#if cancel}<a class="button" href={cancel}>{t('form.cancel')}</a>{/if}
  <p class="hint">{#if name}{t('form.as', { name })} {/if}{t('form.terms')}</p>
</div>

<style>
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px }
  .bar p { flex: 1 1 260px; min-width: 0 }
</style>
