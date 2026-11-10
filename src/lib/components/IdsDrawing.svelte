<script lang="ts">
  // A description drawn beside the add form's field as it is typed. The composer is loaded the
  // first time the page needs it, and each new description replaces the one before, so the field
  // never waits on a drawing that has been superseded.
  import { onMount } from 'svelte'
  import { drawingSvg, isDescription } from 'ids-input'
  import { COMPOSER_VERSION } from '$lib/composer'
  import { cleanIds } from '$lib/ids'

  type Drawing = Parameters<typeof drawingSvg>[0]
  type Preview = (sequence: string, options?: { signal?: AbortSignal }) => Promise<Drawing>

  let { ids }: { ids: string } = $props()
  let preview = $state<Preview | null>(null)
  let drawing = $state.raw<Drawing | null>(null)
  let waiting = $state(false)

  const sequence = $derived(cleanIds(ids))
  const valid = $derived(isDescription(sequence))
  const svg = $derived(drawing ? drawingSvg(drawing) : null)

  onMount(() => {
    let live = true
    import('ids-input/composer')
      .then(({ composerPreview }) => {
        if (live) preview = composerPreview({ base: `https://glyphatlas.org/atlas/composer/${COMPOSER_VERSION}` })
      })
      .catch(() => {})
    return () => { live = false }
  })

  $effect(() => {
    const ask = preview
    const text = sequence
    if (!ask) return
    if (!valid) {
      drawing = null
      waiting = false
      return
    }
    const controller = new AbortController()
    waiting = true
    // A pause in typing asks once; a newer description aborts the one before.
    const timer = setTimeout(() => {
      ask(text, { signal: controller.signal }).then(drawn => {
        if (controller.signal.aborted) return
        drawing = drawn
        waiting = false
      }, error => {
        if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return
        drawing = null
        waiting = false
      })
    }, 140)
    return () => { clearTimeout(timer); controller.abort() }
  })
</script>

<div class="ids-drawing" class:empty={!valid} class:waiting aria-hidden="true">
  {#if svg}
    <div class="ink">{@html svg}</div>
  {:else if valid}
    <span class="sequence">{sequence}</span>
  {/if}
</div>

<style>
  .ids-drawing {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 3px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
  }
  .ids-drawing.empty { background: var(--surface-sunken); }
  .ids-drawing.empty::before { content: ''; width: 16px; height: 16px; border: 1px dashed var(--line-strong); border-radius: 2px; }
  .ink { width: 100%; height: 100%; transition: opacity 120ms; }
  .waiting .ink { opacity: 0.35; }
  .ink :global(svg) { display: block; width: 100%; height: 100% }
  .ink :global(svg > path), .ink :global(svg > text), .ink :global(svg > g path), .ink :global(svg > g text) { fill: currentColor }
  .sequence {
    padding: 2px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.25;
    text-align: center;
    overflow-wrap: anywhere;
  }
</style>
