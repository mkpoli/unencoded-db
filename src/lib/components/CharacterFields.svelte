<script lang="ts">
  // A character as its form describes it: the drawing of the first description on a plate, and beside it
  // the descriptions and whatever the form states next to them. While the drawing's layout is adjusted
  // the plate takes the width of the form.
  import type { Snippet } from 'svelte'
  import type { CharacterFacts } from '$lib/encoded'
  import type { Layout } from '$lib/layout'
  import IdsDrawing from './IdsDrawing.svelte'
  import IdsField from './IdsField.svelte'

  let { values = [], layout = null, primary = $bindable(''), onfill, children }: {
    values?: string[]; layout?: Layout | null; primary?: string; onfill?: (facts: CharacterFacts) => void; children?: Snippet
  } = $props()
  let adjusting = $state(false)
</script>

<div class="character" class:adjusting>
  <div class="plate"><IdsDrawing ids={primary} {layout} bind:adjusting /></div>
  <div class="described">
    <IdsField {values} bind:primary {onfill} />
    {@render children?.()}
  </div>
</div>

<style>
  .character { display: grid; grid-template-columns: 208px minmax(0, 1fr); align-items: start; gap: 24px; min-width: 0 }
  .described { display: flex; flex-direction: column; gap: 16px; min-width: 0 }
  /* The drawing stays in view while the facts beside it are filled in. */
  .plate { position: sticky; inset-block-start: 16px; min-width: 0 }
  .adjusting { grid-template-columns: minmax(0, 1fr) }
  .adjusting .plate { position: static; width: min(100%, 440px); justify-self: center }
  @media (max-width: 700px) {
    .character { grid-template-columns: minmax(0, 1fr); gap: 16px }
    .plate { position: static; width: 148px; justify-self: center }
    .adjusting .plate { width: min(100%, 440px) }
  }
</style>
