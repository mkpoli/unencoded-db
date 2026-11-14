<script lang="ts" module>
  import type { IdsAdapter } from 'ids-input/svelte'
  const BARE: IdsAdapter = { structure: async () => [] }
</script>

<script lang="ts">
  // ids-input's sequence field over an editor of its own: the description as coloured parts with the
  // reach of each operator drawn under them, ASCII operator names (LR, ud) read as operators, and undo.
  // What is wrong with the text shows once the field is left, never while it is typed in.
  import { untrack } from 'svelte'
  import { IdsSequence, createEditor, type IdsEditor } from 'ids-input/svelte'

  let { value = $bindable(''), label, titled = false, compact = false, messages, locale = 'en', placeholder, adapter = BARE, oneditor }: {
    value?: string; label: string; titled?: boolean; compact?: boolean; messages?: Record<string, string>; locale?: string; placeholder?: string
    adapter?: IdsAdapter; oneditor?: (editor: IdsEditor) => void
  } = $props()

  // The field reads no tables until the tools that look parts up are opened over it and hand it theirs.
  const editor = createEditor(() => ({ adapter, messages: { ...messages, 'ids.label': label }, locale, tintMode: 'on' }))
  untrack(() => oneditor?.(editor))

  // The text the editor last handed out, so a `value` set from outside is told from its own.
  let seen = untrack(() => value)
  editor.reset(seen)
  $effect(() => editor.listen(text => { seen = text; value = text }))
  $effect(() => {
    const given = value
    untrack(() => { if (given !== seen && given !== editor.draft) { seen = given; editor.reset(given) } })
  })

  let root = $state<HTMLElement>()
  let left = $state(false)
  // A description is an identifier: a phone's keyboard leaves it as typed.
  $effect(() => {
    const input = root?.querySelector('input')
    input?.setAttribute('autocorrect', 'off')
    input?.setAttribute('autocapitalize', 'none')
  })
  export const focus = () => root?.querySelector('input')?.focus()
</script>

<div class="line" class:compact class:left bind:this={root} onfocusin={() => left = false} onfocusout={() => left = true}>
  <IdsSequence {editor} label={titled} {placeholder} />
  {#if left && editor.problem}<p class="problem" role="status">{editor.problem}</p>{/if}
</div>

<style>
  .line {
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
    --ids-ink: var(--ink); --ids-ink-soft: var(--ink); --ids-muted: var(--muted); --ids-control-border: var(--line-strong);
    --ids-accent: var(--accent); --ids-focus: var(--focus-ring); --ids-fault: var(--line-strong);
  }
  .line.left { --ids-fault: var(--wrong) }
  .line :global(.ids-field) { gap: 6px }
  .line :global(.ids-title) { color: var(--ink); font-size: inherit; font-weight: 500 }
  .line :global(.sequence-wrap) { border-radius: 8px; background: var(--surface) }
  .line :global(input) { outline-offset: 2px }
  .line :global(input:focus-visible) { outline-width: 3px }
  .compact :global(input), .compact :global(.sequence-paint) { font-size: 18px }
  .problem { color: var(--wrong); font-size: 12.5px; line-height: 1.45 }
</style>
