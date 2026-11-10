<script lang="ts">
  import { EVIDENCE_TYPES, isEvidenceType } from '$lib/evidence-types'
  import { evidenceTypeHint, evidenceTypeLabel } from '$lib/evidence-type-labels'
  import { t, type Locale } from '$lib/i18n'

  let { locale, value = [] }: { locale: Locale; value?: readonly string[] } = $props()
  const selected = $derived(new Set(value.filter(isEvidenceType)))
</script>

<fieldset class="genre-field">
  <legend class="field-label">{t(locale, 'field.evidenceTypes')}</legend>
  <div class="genre-options">
    {#each EVIDENCE_TYPES as type (type)}
      <label class="genre-option" title={evidenceTypeHint(locale, type)}>
        <input type="checkbox" name="types" value={type} checked={selected.has(type)} />
        <span class="genre-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{evidenceTypeLabel(locale, type)}
      </label>
    {/each}
  </div>
  <p class="field-help">{t(locale, 'field.evidenceTypesHint')}</p>
</fieldset>
