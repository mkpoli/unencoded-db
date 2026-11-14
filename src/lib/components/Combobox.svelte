<script lang="ts" module>
  export type ComboOption = { label: string; hint?: string; terms?: string; group?: number }
</script>

<script lang="ts">
  // A text field with a list to choose from: the list narrows to what is typed, and whatever is typed is kept
  // when nothing in it fits. It is a plain input until scripts run. The pattern is the ARIA editable combobox
  // with list autocomplete: arrow keys move through the list, Enter takes an option, Escape folds the list.
  // `onchange` hears the value once it is settled: an option taken, or the field left.
  let { id, name, value = $bindable(''), options, labelledby, maxlength, onopen, onchange }: {
    id: string; name: string; value?: string; options: readonly ComboOption[]; labelledby?: string; maxlength?: number; onopen?: () => void; onchange?: (value: string) => void
  } = $props()

  const fold = (text: string) => text.normalize('NFKC').toLowerCase().trim()
  let open = $state(false)
  let active = $state(-1)
  let list = $state<HTMLUListElement>()

  // A value that is already an option shows the whole list, so the other options are there to change to.
  const shown = $derived.by(() => {
    const typed = fold(value)
    if (!typed || options.some(option => fold(option.label) === typed)) return options
    return options.filter(option => fold(`${option.label} ${option.hint ?? ''} ${option.terms ?? ''}`).includes(typed))
  })
  const expanded = $derived(open && shown.length > 0)
  const optionId = (index: number) => `${id}-option-${index}`

  function show() {
    if (!open) onopen?.()
    open = true
  }
  function take(option: ComboOption) {
    value = option.label
    open = false
    active = -1
    onchange?.(value)
  }
  function move(step: number) {
    show()
    if (!shown.length) return
    active = active < 0 ? (step > 0 ? 0 : shown.length - 1) : (active + step + shown.length) % shown.length
    queueMicrotask(() => list?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' }))
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'ArrowDown') { event.preventDefault(); if (event.altKey) show(); else move(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (event.altKey) { open = false; active = -1 } else move(-1) }
    else if (event.key === 'Enter' && expanded && active >= 0) { event.preventDefault(); take(shown[active]) }
    else if (event.key === 'Escape' && open) { event.preventDefault(); open = false; active = -1 }
  }
</script>

<div class="combo">
  <input
    {id} {name} {maxlength} class="input" type="text" role="combobox" autocomplete="off" spellcheck="false"
    aria-autocomplete="list" aria-expanded={expanded} aria-controls="{id}-list" aria-labelledby={labelledby}
    aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
    bind:value onclick={show} onkeydown={keydown} oninput={() => { show(); active = -1 }} onblur={() => { open = false; active = -1; onchange?.(value) }}
  />
  <span class="chevron" aria-hidden="true">⌄</span>
  <ul bind:this={list} id="{id}-list" role="listbox" aria-labelledby={labelledby} hidden={!expanded}>
    {#each shown as option, index (index)}
      <!-- The input takes the keys for the list and names the active option, as the combobox pattern has it. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        id={optionId(index)} role="option" aria-selected={index === active} class:active={index === active}
        class:chosen={fold(option.label) === fold(value)} class:break={index > 0 && option.group !== shown[index - 1].group}
        onpointerdown={event => event.preventDefault()} onclick={() => take(option)}
      ><span>{option.label}</span>{#if option.hint}<span class="hint">{option.hint}</span>{/if}</li>
    {/each}
  </ul>
</div>

<style>
  .combo { position: relative }
  .combo .input { padding-inline-end: 36px }
  .chevron { position: absolute; inset-inline-end: 13px; top: 50%; translate: 0 -60%; color: var(--muted); pointer-events: none }
  ul { position: absolute; inset-inline: 0; top: calc(100% + 4px); z-index: 20; max-height: min(320px, 50dvh); margin: 0; padding: 4px; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: var(--line-strong) transparent; list-style: none; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / 14%) }
  ul[hidden] { display: none }
  li { display: flex; align-items: baseline; gap: 8px; min-height: 38px; padding: 8px 10px; border-radius: 5px; cursor: pointer }
  li:hover, li.active { background: var(--surface-selected) }
  li.chosen { color: var(--accent); font-weight: 500 }
  li.break { margin-top: 5px; position: relative }
  li.break::before { content: ''; position: absolute; inset-inline: 6px; top: -3px; border-top: 1px solid var(--line) }
  .hint { color: var(--muted); font-size: 12.5px; font-weight: 400 }
</style>
