<script lang="ts">
  // A star for the record on show; starred records are listed on the favourites page.
  import { favouritesReady, isFavourite, setFavourite } from '$lib/favourites.svelte'
  import { t } from '$lib/t'

  let { id, initial = false, onerror }: { id: number; initial?: boolean; onerror?: (message: string) => void } = $props()
  const starred = $derived(favouritesReady() ? isFavourite(id) : initial)
  let failed = $state('')

  async function toggle() {
    failed = ''
    onerror?.('')
    try {
      await setFavourite(id, !starred)
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error)
      onerror?.(failed)
    }
  }
</script>

<button
  type="button"
  class="button favourite"
  class:starred
  aria-pressed={starred}
  title={failed || (starred ? t('favourites.remove') : t('favourites.add'))}
  aria-label={starred ? t('favourites.remove') : t('favourites.add')}
  onclick={toggle}
>
  <svg viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
</button>

<style>
  .favourite { flex: none; width: 40px; padding: 0; color: var(--muted) }
  .favourite svg { width: 20px; height: 20px }
  .favourite:hover { color: var(--ink) }
  .favourite.starred { color: var(--accent); border-color: var(--accent); background: var(--accent-light) }
</style>
