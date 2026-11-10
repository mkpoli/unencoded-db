<script lang="ts">
  import { SCRIPTS } from '$lib/scripts'
  import { t } from '$lib/t'

  let { value = 'han', other = '' }: { value?: string; other?: string | null } = $props()
  let chosen = $derived(value)
</script>

<fieldset class="field">
  <legend class="label required">{t('field.script')}</legend>
  <div class="options">
    {#each SCRIPTS as script (script.id)}
      <label class="option" class:on={chosen === script.id}>
        <input type="radio" name="script" value={script.id} bind:group={chosen} />
        <span>{t(`script.${script.id}`)}</span>{#if script.own && script.own !== t(`script.${script.id}`)}<span class="own">{script.own}</span>{/if}
      </label>
    {/each}
  </div>
  {#if chosen === 'other'}
    <input class="input" name="script_other" value={other ?? ''} aria-label={t('field.scriptOther')} placeholder={t('field.scriptOther')} />
  {/if}
</fieldset>

<style>
  fieldset { border: 0; margin: 0; padding: 0 }
  legend { padding: 0; margin-bottom: 6px }
  .options { display: flex; flex-wrap: wrap; gap: 6px }
  .option { display: inline-flex; align-items: baseline; gap: 6px; min-height: 36px; padding: 7px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); cursor: pointer }
  .option:hover { border-color: var(--line-strong) }
  .option.on { border-color: var(--accent); background: var(--accent-light) }
  .option:has(input:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .option input { position: absolute; opacity: 0; width: 1px; height: 1px }
  .own { color: var(--muted); font-size: 12px }
</style>
