<script lang="ts" module>
  // One composer for the page visit: a reader who leaves the form and comes back reuses its worker and the
  // export files it has already read.
  import type { Drawing } from 'ids-input/composer'
  import { COMPOSER_VERSION } from '$lib/composer'
  type Preview = ReturnType<typeof import('ids-input/composer').composerPreview>
  let shared: Promise<Preview> | null = null
  function load() {
    shared ??= import('ids-input/composer').then(({ composerPreview }) => composerPreview({ base: `https://glyphatlas.org/atlas/composer/${COMPOSER_VERSION}` }))
    shared.catch(() => { shared = null })
    return shared
  }
</script>

<script lang="ts">
  // A description drawn by han-compose as it is typed, on a plate beside its field. The composer runs in
  // the browser and is loaded when the plate first appears; each new description replaces the one before,
  // so the field never waits on a drawing that has been superseded. The description is the plate's text.
  import { onMount } from 'svelte'
  import { drawingSvg, isDescription } from 'ids-input'
  import { cleanIds } from '$lib/ids'

  let { ids }: { ids: string } = $props()
  let preview = $state.raw<Preview | null>(null)
  let drawing = $state.raw<Drawing | null>(null)
  let waiting = $state(false)

  const sequence = $derived(cleanIds(ids))
  const whole = $derived(isDescription(sequence))
  const svg = $derived(drawing?.d ? drawingSvg(drawing) : null)

  onMount(() => {
    let live = true
    // The export's manifest and layout are read while the first description is still being typed.
    load().then(found => { found.warm(); if (live) preview = found }, () => {})
    return () => { live = false }
  })

  $effect(() => {
    const ask = preview, text = sequence
    if (!ask) return
    if (!whole) { drawing = null; waiting = false; return }
    const controller = new AbortController()
    waiting = true
    // A pause in typing asks once; a newer description ends the one before.
    const timer = setTimeout(() => {
      ask(text, { signal: controller.signal }).then(drawn => {
        if (controller.signal.aborted) return
        drawing = drawn; waiting = false
      }, () => {
        if (controller.signal.aborted) return
        drawing = null; waiting = false
      })
    }, 140)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="plate" class:empty={!whole} class:waiting role={whole ? 'img' : undefined} aria-label={whole ? sequence : undefined} aria-hidden={whole ? undefined : 'true'}>
  {#if svg}
    <div class="ink">{@html svg}</div>
  {:else if whole}
    <span class="sequence">{sequence}</span>
  {/if}
</div>

<style>
  .plate { display: grid; place-items: center; width: 100%; aspect-ratio: 1; padding: 7%; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink) }
  .plate.empty { background: var(--surface-sunken) }
  .plate.empty::before { content: ''; width: 22%; aspect-ratio: 1; border: 1.5px dashed var(--line-strong); border-radius: 4px }
  .ink { width: 100%; height: 100%; transition: opacity 120ms }
  .waiting .ink { opacity: .35 }
  .ink :global(svg) { display: block; width: 100%; height: 100% }
  .ink :global(svg path), .ink :global(svg text) { fill: currentColor }
  .sequence { color: var(--muted); font-size: 20px; line-height: 1.3; text-align: center; overflow-wrap: anywhere }
  @media (prefers-reduced-motion: reduce) { .ink { transition: none } }
</style>
