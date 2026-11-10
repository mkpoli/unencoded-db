<script lang="ts">
  // Further descriptions of the same character. The page owns the first, larger field; this list
  // adds and removes the others and submits them under the same name.
  import { IDS_MAX } from '$lib/ids'
  import { t, type Locale } from '$lib/i18n'

  let { values = $bindable<string[]>(['']), locale }: { values?: string[]; locale: Locale } = $props()

  /** Add an empty description row. */
  function add() {
    if (values.length < IDS_MAX) values.push('')
  }
  /** Remove a description row, keeping one row on the page. */
  function remove(index: number) {
    values.splice(index, 1)
    if (!values.length) values.push('')
  }
</script>

{#each values as _, index}
  {#if index > 0}
    <div class="ids-more-row">
      <input class="input" name="ids" maxlength="200" bind:value={values[index]} aria-label={`${t(locale, 'field.ids')} ${index + 1}`} autocomplete="off" spellcheck="false" />
      <button class="secondary ids-remove" type="button" aria-label={t(locale, 'field.idsRemove')} title={t(locale, 'field.idsRemove')} onclick={() => remove(index)}>×</button>
    </div>
  {/if}
{/each}
{#if values.length < IDS_MAX}
  <button class="secondary ids-add" type="button" onclick={add}>{t(locale, 'field.idsAdd')}</button>
{/if}
