<script lang="ts">
  // The codes the character has in character sets. A set outside the list is named in its own field,
  // which then carries the row's `encoding_charset`, so the two lists the form sends stay in step.
  import { untrack } from 'svelte'
  import { ENCODING_SETS, OTHER_ENCODING, isEncodingSet, type Encoding } from '$lib/encodings'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { t } from '$lib/t'

  type Row = { charset: string; code: string; other: string }
  // `code` is a Unicode code to state when no row states it yet.
  let { values = [], code = '' }: { values?: Encoding[]; code?: string } = $props()

  const uid = $props.id()
  const row = (encoding: Encoding): Row => isEncodingSet(encoding.charset)
    ? { charset: encoding.charset, code: encoding.code, other: '' }
    : { charset: OTHER_ENCODING, code: encoding.code, other: encoding.charset }
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
</script>

<fieldset class="group">
  <legend class="label">{t('field.encodings')}</legend>
  <input type="hidden" name="encodings_present" value="1" />
  {#each rows as item, index}
    <div class="encoding">
      <div class="field">
        <label for="{uid}-set-{index}">{t('field.encodingCharset')}</label>
        <select id="{uid}-set-{index}" class="input" name={item.charset === OTHER_ENCODING ? undefined : 'encoding_charset'} bind:value={item.charset}>
          {#each ENCODING_SETS as set (set.id)}<option value={set.id}>{set.label}</option>{/each}
          <option value={OTHER_ENCODING}>{t('field.encodingOther')}</option>
        </select>
        {#if item.charset === OTHER_ENCODING}
          <input class="input" name="encoding_charset" maxlength="40" bind:value={item.other} required={Boolean(item.code.trim())} aria-label={t('field.encodingOther')} placeholder={t('field.encodingOther')} />
        {/if}
      </div>
      <div class="field">
        <label for="{uid}-code-{index}">{t('field.encodingCode')}</label>
        <input id="{uid}-code-{index}" class="input mono" name="encoding_code" maxlength={CLAIM_LIMITS.encoding.length} bind:value={item.code} placeholder={item.charset === 'unicode' ? 'U+2D6DD' : ''} autocomplete="off" spellcheck="false" />
      </div>
      <button class="button remove" type="button" onclick={() => rows.splice(index, 1)}>{t('field.encodingRemove')}</button>
    </div>
  {/each}
  {#if rows.length < CLAIM_LIMITS.encoding.max}<button class="button" type="button" onclick={() => rows.push({ charset: 'unicode', code: '', other: '' })}>{t('field.encodingAdd')}</button>{/if}
</fieldset>

<style>
  .group { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .group legend { padding: 0; margin-bottom: 6px }
  .encoding { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: 10px; width: 100% }
  .field { gap: 6px }
  .remove { color: var(--muted) }
  @media (max-width: 560px) { .encoding { grid-template-columns: minmax(0, 1fr) } .remove { justify-self: start } }
</style>
