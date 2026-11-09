<script lang="ts">
  import { untrack } from 'svelte'
  import { COMPARISON_BOXES, COMPARISON_KINDS, boxesFromComparisons, relationshipLabel, splitCharacters, type Comparison, type ComparisonKind } from '$lib/comparison-rows'
  import type { Locale } from '$lib/i18n'

  let { locale, rows = [], invalid = false, describedBy = undefined }: { locale: Locale; rows?: Comparison[]; invalid?: boolean; describedBy?: string } = $props()
  const boxId = (kind: ComparisonKind, index: number) => `comparison-${kind}-${index}`
  let boxes = $state(untrack(() => boxesFromComparisons(rows)))
  let composing = false

  function focus(kind: ComparisonKind, index: number) {
    if (index >= 0 && index < COMPARISON_BOXES) document.getElementById(boxId(kind, index))?.focus()
  }

  function write(kind: ComparisonKind, index: number, characters: string[]) {
    let slot = index
    for (const character of characters) {
      if (slot >= COMPARISON_BOXES) break
      boxes[kind][slot++] = character
    }
    focus(kind, slot)
  }

  function input(kind: ComparisonKind, index: number, event: Event) {
    if (composing) return
    const box = event.currentTarget as HTMLInputElement
    const value = box.value.replace(/\s+/g, '')
    const characters = splitCharacters(value)
    if (characters.length > 1) { write(kind, index, characters); return }
    boxes[kind][index] = value
    if (characters.length === 1) focus(kind, index + 1)
  }

  function paste(kind: ComparisonKind, index: number, event: ClipboardEvent) {
    const characters = splitCharacters((event.clipboardData?.getData('text') ?? '').replace(/\s+/g, ''))
    if (characters.length < 2) return
    event.preventDefault()
    write(kind, index, characters)
  }

  function keydown(kind: ComparisonKind, index: number, event: KeyboardEvent) {
    if (event.key !== 'Backspace' || index === 0) return
    if ((event.currentTarget as HTMLInputElement).value) return
    event.preventDefault()
    boxes[kind][index - 1] = ''
    focus(kind, index - 1)
  }
</script>

<div class="relation-grid">
  {#each COMPARISON_KINDS as kind}
    {@const label = relationshipLabel(locale, kind)}
    <span class="relation-label" id={`comparison-${kind}-label`}>{label}</span>
    <div class="relation-boxes" role="group" aria-labelledby={`comparison-${kind}-label`}>
      {#each Array(COMPARISON_BOXES) as _, index}
        <input
          class="relation-box"
          id={boxId(kind, index)}
          name={`comparison_${kind}`}
          maxlength="4"
          value={boxes[kind][index]}
          aria-label={`${label} ${index + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          oninput={(event) => input(kind, index, event)}
          onpaste={(event) => paste(kind, index, event)}
          onkeydown={(event) => keydown(kind, index, event)}
          oncompositionstart={() => composing = true}
          oncompositionend={() => composing = false}
        />
      {/each}
    </div>
  {/each}
</div>
