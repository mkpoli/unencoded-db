<script lang="ts">
  // The script of a record: a line naming it, which opens onto the list of scripts. Nearly every record is
  // Han, so the list stays folded until someone asks for it.
  import { untrack } from 'svelte'
  import { SCRIPTS } from '$lib/scripts'
  import { t } from '$lib/t'
  import FactLine from './FactLine.svelte'

  let { value = 'han', other = '' }: { value?: string; other?: string | null } = $props()
  const uid = $props.id()
  let chosen = $state(untrack(() => value))
  // A script named in the visitor's words shows its name field from the start.
  let open = $state(untrack(() => value === 'other'))
  // The name a script gives itself, where the page's language names it otherwise.
  const own = (id: string) => { const name = SCRIPTS.find(script => script.id === id)?.own; return name && name !== t(`script.${id}`) ? name : '' }
</script>

<FactLine label={t('field.script')} labelId="{uid}-label" stated bind:open>
  {#snippet value()}{t(`script.${chosen}`)}{#if own(chosen)}<span class="own">{own(chosen)}</span>{/if}{/snippet}
  <select class="input" name="script" bind:value={chosen} aria-labelledby="{uid}-label">
    {#each SCRIPTS as script (script.id)}<option value={script.id}>{t(`script.${script.id}`)}{own(script.id) ? ` ${own(script.id)}` : ''}</option>{/each}
  </select>
  {#if chosen === 'other'}
    <div class="field"><label for="{uid}-other">{t('field.scriptOther')}</label><input id="{uid}-other" class="input" name="script_other" value={other ?? ''} maxlength="80" /></div>
  {/if}
</FactLine>

<style>
  .own { color: var(--muted); font-size: 12.5px }
</style>
