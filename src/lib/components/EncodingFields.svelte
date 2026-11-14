<script lang="ts">
  // The codes the character has in the works it is registered in. A work outside the list is named in its
  // own field, which then carries the row's `encoding_charset`, so the two lists the form sends stay in step.
  import { untrack } from 'svelte'
  import { REGISTRIES, OTHER_REGISTRY, isRegistry, registryLabel, registryOf, type Encoding } from '$lib/registries'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { t } from '$lib/t'

  type Row = { charset: string; code: string; other: string }
  // `code` is a Unicode code to state when no row states it yet. `stated` follows the codes the rows hold,
  // each with the name of its set, for a summary outside.
  let { values = [], code = '', stated = $bindable([]) }: { values?: Encoding[]; code?: string; stated?: string[] } = $props()

  const uid = $props.id()
  const row = (encoding: Encoding): Row => isRegistry(encoding.charset)
    ? { charset: encoding.charset, code: encoding.code, other: '' }
    : { charset: OTHER_REGISTRY, code: encoding.code, other: encoding.charset }
  let rows = $state<Row[]>(untrack(() => values.length ? values.map(row) : [{ charset: 'unicode', code: '', other: '' }]))

  $effect(() => {
    if (!code) return
    untrack(() => {
      if (rows.some(item => item.charset === 'unicode' && item.code.trim().toUpperCase().startsWith(code))) return
      const empty = rows.find(item => item.charset === 'unicode' && !item.code.trim())
      if (empty) empty.code = code
      else if (rows.length < CLAIM_LIMITS.encoding.max) rows.push({ charset: 'unicode', code, other: '' })
    })
  })
  $effect.pre(() => {
    stated = rows.filter(item => item.code.trim()).map(item => `${item.charset === OTHER_REGISTRY ? item.other.trim() : registryLabel(item.charset)} ${item.code.trim()}`.trim())
  })
</script>

<div class="group" role="group" aria-label={t('field.encodings')}>
  <input type="hidden" name="encodings_present" value="1" />
  {#if rows.length}<div class="head" aria-hidden="true"><span>{t('field.encodingCharset')}</span><span>{t('field.encodingCode')}</span><span></span></div>{/if}
  {#each rows as item, index}
    <div class="encoding">
      <div class="set">
        <select id="{uid}-set-{index}" class="input" name={item.charset === OTHER_REGISTRY ? undefined : 'encoding_charset'} bind:value={item.charset} aria-label="{t('field.encodingCharset')} {index + 1}">
          {#each REGISTRIES as set (set.id)}<option value={set.id}>{set.label}</option>{/each}
          <option value={OTHER_REGISTRY}>{t('field.encodingOther')}</option>
        </select>
        {#if item.charset === OTHER_REGISTRY}
          <input class="input" name="encoding_charset" maxlength="40" bind:value={item.other} required={Boolean(item.code.trim())} aria-label={t('field.encodingOther')} placeholder={t('field.encodingOther')} />
        {/if}
      </div>
      <input id="{uid}-code-{index}" class="input mono" name="encoding_code" maxlength={CLAIM_LIMITS.encoding.length} bind:value={item.code} placeholder={registryOf(item.charset)?.example ?? ''} aria-label="{t('field.encodingCode')} {index + 1}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" />
      {#if rows.length > 1 || item.code}<button class="remove" type="button" aria-label="{t('field.encodingRemove')} {index + 1}" title={t('field.encodingRemove')} onclick={() => rows.splice(index, 1)}><span aria-hidden="true">×</span></button>{/if}
    </div>
  {/each}
  {#if rows.length < CLAIM_LIMITS.encoding.max}<button class="text-button" type="button" onclick={() => rows.push({ charset: 'unicode', code: '', other: '' })}>+ {t('field.encodingAdd')}</button>{/if}
</div>

<style>
  .group { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0 }
  .head, .encoding { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px; align-items: start; gap: 8px; width: 100% }
  .head { font-weight: 500 }
  .set { display: grid; gap: 6px; min-width: 0 }
  .remove { width: 28px; height: 42px; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
</style>
