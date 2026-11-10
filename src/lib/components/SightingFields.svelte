<script lang="ts">
  // Where a character was seen. The place is the only line asked for; the reference IRG wants stays folded.
  import { CONTEXTS, SIGHTING_TYPES, STYLES, parseSightingTypes } from '$lib/scripts'
  import { t } from '$lib/t'
  import type { SightingFields } from '$lib/server/entries'

  let { values = {}, requirePlace = true }: { values?: Partial<SightingFields>; requirePlace?: boolean } = $props()
  const selected = $derived(new Set(parseSightingTypes(values.types)))
  const filled = $derived(Boolean(values.title || values.author || values.publisher || values.year || values.page || values.context || values.style || values.types || values.note))
</script>

<div class="field">
  <label for="place" class:required={requirePlace}>{t('field.place')}</label>
  <input id="place" class="input" name="place" value={values.place ?? ''} maxlength="500" />
  <p class="hint">{t('field.placeHint')}</p>
</div>
<div class="field">
  <label for="url">{t('field.url')}</label>
  <input id="url" class="input" type="url" name="url" value={values.url ?? ''} placeholder="https://" maxlength="1000" />
  <p class="hint">{t('field.urlHint')}</p>
</div>
<fieldset class="types">
  <legend>{t('field.sourceTypes')}</legend>
  <p class="hint">{t('field.sourceTypesHint')}</p>
  <div class="type-grid">
    {#each SIGHTING_TYPES as type}
      <label class="type">
        <input type="checkbox" name="types" value={type} checked={selected.has(type)} />
        <span class="type-text"><span class="type-name">{t(`evidence.type.${type}`)}</span><span class="hint">{t(`evidence.type.${type}.hint`)}</span></span>
      </label>
    {/each}
  </div>
</fieldset>
<details class="more" open={filled}>
  <summary>{t('field.source')}</summary>
  <p class="hint">{t('field.sourceHint')}</p>
  <div class="grid-2">
    <div class="field"><label for="title">{t('field.title')}</label><input id="title" class="input" name="title" value={values.title ?? ''} /></div>
    <div class="field"><label for="author">{t('field.author')}</label><input id="author" class="input" name="author" value={values.author ?? ''} /></div>
    <div class="field"><label for="publisher">{t('field.publisher')}</label><input id="publisher" class="input" name="publisher" value={values.publisher ?? ''} /></div>
    <div class="grid-2">
      <div class="field"><label for="year">{t('field.year')}</label><input id="year" class="input" name="year" value={values.year ?? ''} /></div>
      <div class="field"><label for="page">{t('field.page')}</label><input id="page" class="input" name="page" value={values.page ?? ''} /></div>
    </div>
    <div class="field"><label for="context">{t('field.context')}</label>
      <select id="context" class="input" name="context" value={values.context ?? ''}><option value="">{t('field.unset')}</option>{#each CONTEXTS as item}<option value={item}>{t(`context.${item}`)}</option>{/each}</select></div>
    <div class="field"><label for="style">{t('field.style')}</label>
      <select id="style" class="input" name="style" value={values.style ?? ''}><option value="">{t('field.unset')}</option>{#each STYLES as item}<option value={item}>{t(`style.${item}`)}</option>{/each}</select></div>
  </div>
  <div class="field"><label for="note">{t('field.note')}</label><textarea id="note" class="input" name="note" rows="2">{values.note ?? ''}</textarea></div>
</details>

<style>
  .types { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .types legend { padding: 0; font-weight: 500 }
  .type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
  .type { display: flex; align-items: flex-start; gap: 8px; min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 7px; cursor: pointer }
  .type:hover { border-color: var(--line-strong) }
  .type:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .type input { flex: none; margin: 3px 0 0; accent-color: var(--accent) }
  .type-text { display: flex; flex-direction: column; gap: 2px; min-width: 0 }
  .type-name { font-size: 13.5px; font-weight: 500 }
  .type .hint { font-size: 12px }
  .more { display: flex; flex-direction: column; border-top: 1px solid var(--line); padding-top: 12px }
  .more[open] > :global(* + *) { margin-top: 12px }
  summary { font-weight: 500; cursor: pointer }
  @media (max-width: 560px) { .type-grid { grid-template-columns: minmax(0, 1fr) } }
</style>
