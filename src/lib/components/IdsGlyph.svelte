<script lang="ts">
  // The character a description names, drawn by han-compose on the server and kept beside its
  // record, with its parts moved as the record's layout says. A drawing the page did not have is asked
  // for once it is near the viewport; until then, and when the composer cannot draw a part, the
  // description stands in. A drawing is one path, or the server's own SVG markup when a layout moved a part.
  import { onMount } from 'svelte'

  let { ids, layout = null, path: given = null }: { ids: string; layout?: string | null; path?: string | null } = $props()
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
    const wanted = `/api/glyph?ids=${encodeURIComponent(ids)}${layout ? `&layout=${encodeURIComponent(layout)}` : ''}`
    if (path || !visible || !ids || asking === wanted) return
    asking = wanted
    let live = true
    fetch(wanted)
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
    <svg viewBox="0 0 1000 1000">{#if path.startsWith('<')}{@html path}{:else}<path d={path} />{/if}</svg>
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
