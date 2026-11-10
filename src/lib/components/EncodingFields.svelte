<script lang="ts">
  import { untrack } from 'svelte'
  import { ENCODING_SETS, OTHER_ENCODING, isEncodingSet, type Encoding } from '$lib/encodings'
  import { t, type Locale } from '$lib/i18n'

  type Row = { charset: string; code: string; other: string }

  let { locale, values = [], error = '' }: { locale: Locale; values?: Encoding[]; error?: string } = $props()

  const row = (encoding: Encoding): Row => isEncodingSet(encoding.charset)
    ? { charset: encoding.charset, code: encoding.code, other: '' }
    : { charset: OTHER_ENCODING, code: encoding.code, other: encoding.charset }

  let rows = $state<Row[]>(untrack(() => values.length ? values.map(row) : [{ charset: 'unicode', code: '', other: '' }]))

  function add() {
    if (rows.length < 20) rows.push({ charset: 'unicode', code: '', other: '' })
  }

  function remove(index: number) {
    rows.splice(index, 1)
  }
</script>

<fieldset class="field encodings-field" id="encodings" tabindex="-1">
  <legend class="field-label">{t(locale, 'field.encodings')}</legend>
  {#each rows as item, index}
    <div class="encoding-row">
      <div class="field">
        <label class="field-label" for={`encoding-charset-${index}`}>{t(locale, 'field.encodingCharset')}</label>
        <select id={`encoding-charset-${index}`} name="encoding_charset" bind:value={item.charset}>
          {#each ENCODING_SETS as set (set.id)}<option value={set.id}>{set.label}</option>{/each}
          <option value={OTHER_ENCODING}>{t(locale, 'field.encodingOther')}</option>
        </select>
        {#if item.charset === OTHER_ENCODING}
          <input name="encoding_charset_other" maxlength="80" bind:value={item.other} aria-label={t(locale, 'field.encodingOther')} placeholder={t(locale, 'field.encodingOther')} />
        {:else}
          <input type="hidden" name="encoding_charset_other" value="" />
        {/if}
      </div>
      <div class="field">
        <label class="field-label" for={`encoding-code-${index}`}>{t(locale, 'field.encodingCode')}</label>
        <input id={`encoding-code-${index}`} name="encoding_code" maxlength="80" bind:value={item.code} placeholder={item.charset === 'unicode' ? 'U+2D6DD' : ''} autocomplete="off" spellcheck="false" />
      </div>
      <button class="quiet-link encoding-remove" type="button" onclick={() => remove(index)}>{t(locale, 'field.encodingRemove')}</button>
    </div>
  {/each}
  {#if rows.length < 20}<button class="secondary encoding-add" type="button" onclick={add}>{t(locale, 'field.encodingAdd')}</button>{/if}
  <p class="field-help">{t(locale, 'field.encodingHint')}</p>
  {#if error}<p class="field-error" id="encodings-error">{error}</p>{/if}
</fieldset>
