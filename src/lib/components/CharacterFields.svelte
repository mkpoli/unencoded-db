<script lang="ts">
  // A character as its form describes it: the drawing of the first description on a plate, and beside it
  // the descriptions and whatever the form states next to them. The plate marks the part the description's
  // tools are working on, over the other glyph styles. While the drawing's layout is adjusted the plate
  // takes the width of the form.
  import type { Snippet } from 'svelte'
  import type { Fill } from '$lib/encoded'
  import type { Layout } from '$lib/layout'
  import IdsDrawing from './IdsDrawing.svelte'
  import IdsField from './IdsField.svelte'

  let { values = [], layout = null, primary = $bindable(''), exclude = null, sighting = null, anchor, onfill, children }: {
    values?: string[]; layout?: Layout | null; primary?: string; exclude?: number | null; sighting?: number | null; anchor?: string; onfill?: (fill: Fill) => void; children?: Snippet
  } = $props()
  let field = $state<IdsField>()
  export const focus = () => field?.focus()
  export const append = (value?: string) => field?.append(value)
  let adjusting = $state(false)
  let chosen = $state.raw<number[] | null>(null)
</script>

<div class="character-container">
  <div class="character" class:adjusting>
    <div class="plate"><IdsDrawing ids={primary} {layout} {chosen} bind:adjusting /></div>
    <div class="described">
      <IdsField bind:this={field} {values} bind:primary bind:chosen {exclude} {sighting} {anchor} {onfill} />
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .character-container { container: character / inline-size }
  .character { display: grid; grid-template-columns: 232px minmax(0, 1fr); align-items: start; gap: 24px; min-width: 0 }
  .described { display: flex; flex-direction: column; gap: 16px; min-width: 0 }
  /* The drawing stays in view while the facts beside it are filled in. */
  .plate { position: sticky; inset-block-start: 16px; min-width: 0 }
  .adjusting { grid-template-columns: minmax(0, 1fr) }
  .adjusting .plate { position: static; width: min(100%, 440px); justify-self: center }
  @container character (inline-size < 36rem) {
    .character { grid-template-columns: minmax(0, 1fr); gap: 16px }
    .plate { position: static; inline-size: min(280px, 100%); justify-self: center }
    .adjusting .plate { width: min(100%, 440px) }
  }
</style>
