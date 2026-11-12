<script lang="ts">
  // The script of a record: one line naming it, which opens onto the list of scripts. Nearly every record
  // is Han, so the list stays folded until someone asks for it.
  import { untrack } from 'svelte'
  import { SCRIPTS } from '$lib/scripts'
  import { t } from '$lib/t'

  let { value = 'han', other = '' }: { value?: string; other?: string | null } = $props()
  const uid = $props.id()
  let chosen = $state(untrack(() => value))
  // A script named in the visitor's words shows its name field from the start.
  let open = $state(untrack(() => value === 'other'))
  // The name a script gives itself, where the page's language names it otherwise.
  const own = (id: string) => { const name = SCRIPTS.find(script => script.id === id)?.own; return name && name !== t(`script.${id}`) ? name : '' }
</script>

<details class="script" bind:open>
  <summary>
    <span class="label" id="{uid}-label">{t('field.script')}</span>
    <span class="value">{t(`script.${chosen}`)}{#if own(chosen)}<span class="own">{own(chosen)}</span>{/if}</span>
    <span class="change">{t('field.scriptChange')}<span class="chevron" aria-hidden="true">⌄</span></span>
  </summary>
  <div class="body">
    <select class="input" name="script" bind:value={chosen} aria-labelledby="{uid}-label">
      {#each SCRIPTS as script (script.id)}<option value={script.id}>{t(`script.${script.id}`)}{own(script.id) ? ` ${own(script.id)}` : ''}</option>{/each}
    </select>
    {#if chosen === 'other'}
      <div class="field"><label for="{uid}-other">{t('field.scriptOther')}</label><input id="{uid}-other" class="input" name="script_other" value={other ?? ''} maxlength="80" /></div>
    {/if}
  </div>
</details>

<style>
  summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; list-style: none; cursor: pointer }
  summary::-webkit-details-marker { display: none }
  .own { margin-inline-start: 6px; color: var(--muted); font-size: 12.5px }
  .change { margin-inline-start: auto; color: var(--muted); font-size: 12.5px; white-space: nowrap }
  .chevron { display: inline-block; margin-inline-start: 4px; transition: transform 120ms ease }
  .script[open] .chevron { transform: rotate(180deg) }
  .script[open] .value { display: none }
  .body { display: grid; gap: 12px; margin-top: 8px }
</style>
