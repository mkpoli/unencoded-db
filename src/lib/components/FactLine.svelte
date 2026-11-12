<script lang="ts">
  // One fact about a character as a line: its name, what the record states, and the fields that state it,
  // folded until someone opens the line. Lines stack into the sheet beside a character's descriptions.
  // A field the browser finds invalid opens its line, so its message has somewhere to show.
  import type { Snippet } from 'svelte'
  import { t } from '$lib/t'

  let { label, labelId, stated = false, open = $bindable(false), value, children }: {
    label: string; labelId?: string; stated?: boolean; open?: boolean; value?: Snippet; children: Snippet
  } = $props()
</script>

<details class="fact" bind:open>
  <summary>
    <span class="label" id={labelId}>{label}</span>
    <span class="value" class:none={!stated} aria-live="polite">{#if stated && value}{@render value()}{:else}{t('field.notSet')}{/if}</span>
    <span class="edit">{t('form.edit')}<span class="chevron" aria-hidden="true">⌄</span></span>
  </summary>
  <div class="body" oninvalidcapture={() => open = true}>{@render children()}</div>
</details>

<style>
  :global(.fact) ~ .fact { padding-top: 10px; border-top: 1px dashed var(--line) }
  summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; list-style: none; cursor: pointer }
  summary::-webkit-details-marker { display: none }
  .value { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; min-width: 0 }
  .value.none { color: var(--muted) }
  .edit { margin-inline-start: auto; color: var(--muted); font-size: 12.5px; white-space: nowrap }
  summary:hover .edit { color: var(--ink) }
  .chevron { display: inline-block; margin-inline-start: 4px; transition: transform 120ms ease }
  .fact[open] .chevron { transform: rotate(180deg) }
  .body { display: grid; gap: 12px; margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-sunken) }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none } }
</style>
