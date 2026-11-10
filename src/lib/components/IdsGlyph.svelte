<script lang="ts">
  // The character a description names, drawn by han-compose on the server and kept beside its
  // record. A sequence the page did not have is asked for once it is near the viewport; until then,
  // and when the composer cannot draw a part, the description stands in.
  import { onMount } from 'svelte'

  let { ids, path: given = null }: { ids: string; path?: string | null } = $props()
  let host = $state<HTMLElement>()
  let visible = $state(false)
  let fetched = $state<string | null>(null)
  const path = $derived(given ?? fetched)

  onMount(() => {
    if (!host) { visible = true; return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect() }
    }, { rootMargin: '240px' })
    observer.observe(host)
    return () => observer.disconnect()
  })

  let asking = ''
  $effect(() => {
    if (path || !visible || !ids || asking === ids) return
    asking = ids
    let live = true
    fetch(`/api/glyph?ids=${encodeURIComponent(ids)}`)
      .then(response => response.ok ? response.json() : null)
      .then((answer: unknown) => {
        if (live && answer && typeof answer === 'object' && 'd' in answer && typeof answer.d === 'string') fetched = answer.d
      })
      .catch(() => {})
    return () => { live = false }
  })
</script>

<span class="glyph" bind:this={host} aria-hidden="true">
  {#if path}
    <svg viewBox="0 0 1000 1000"><path d={path} /></svg>
  {:else}
    <span class="sequence">{ids}</span>
  {/if}
</span>

<style>
  .glyph { display: block; width: 100%; height: 100%; padding: 3% }
  svg { display: block; width: 100%; height: 100% }
  path { fill: currentColor }
  .sequence { display: grid; place-items: center; width: 100%; height: 100%; padding: 4px; font-size: 20px; line-height: 1.3; text-align: center; overflow-wrap: anywhere }
</style>
