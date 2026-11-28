<script lang="ts">
  // The IDS Workshop's tools for the search box: the operators, and the pickers a part or a character is
  // taken from (by reading, meaning, code point, stroke count or a drawing; from the palette of parts that are
  // hard to type; from the parts of other characters). Each thing taken is handed to `onpick`, to go where
  // the caret is in the box. The tools work on an editor of their own that is emptied after every pick.
  import { untrack } from 'svelte'
  import { createEditor, IdsOperators, IdsPicker } from 'ids-input/svelte'
  import { watchFallback } from '../../../node_modules/ids-input/src/svelte/fallback-font.js'
  import { adapter } from './IdsBuilder.svelte'

  let { messages, locale = 'en', onpick }: { messages?: Record<string, string>; locale?: string; onpick: (text: string) => void } = $props()

  const editor = createEditor(() => ({ adapter, messages, locale, tintMode: 'off' }))
  // An operator arrives with its empty slots, which the search reads as parts left open already.
  $effect(() => editor.listen(text => {
    const taken = text.replace(/[⬚＋]/gu, '')
    if (!taken) return
    untrack(() => onpick(taken))
    queueMicrotask(() => editor.reset(''))
  }))

  let root = $state<HTMLElement | null>(null)
  $effect(() => { if (root) return watchFallback(root) })
  // Enter in one of the tools' own inputs is theirs, and never sends the search they stand in.
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tools" bind:this={root} onkeydown={keydown}>
  <IdsOperators {editor} keyHints={false} />
  <IdsPicker {editor} pickers={['find', 'parts', 'from']} recentKey="ug.recentParts" title={false} />
</div>

<style>
  .tools {
    display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface);
    --ids-ink: var(--ink); --ids-ink-soft: var(--ink); --ids-muted: var(--muted); --ids-line: var(--line); --ids-line-strong: var(--line-strong);
    --ids-surface: var(--surface); --ids-surface-subtle: var(--surface-sunken); --ids-surface-selected: var(--surface-selected);
    --ids-accent: var(--accent); --ids-accent-light: var(--accent-light); --ids-focus: var(--focus-ring); --ids-fault: var(--wrong);
  }
  /* A part of a search is left open by leaving it out, so the key that empties a chosen part has nothing to do here. */
  .tools :global(.ids-op-group[data-arity="0"]) { display: none }
  .tools :global(.ids-strokes) { min-inline-size: 5.5em }
</style>
