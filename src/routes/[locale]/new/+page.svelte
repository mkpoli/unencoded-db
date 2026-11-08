<script lang="ts">
  import { untrack } from 'svelte'
  import FileField from '$lib/components/FileField.svelte'
  import { newComparison, relationshipLabel, removeComparison } from '$lib/comparison-rows'
  import { t, type Locale } from '$lib/i18n'

  type Values = Record<string, string>
  type Comparison = { character: string; relationship: string; differences: string; evidence: string }
  type Form = {
    errors?: Record<string, string>
    values?: Values
    comparisons?: { rows: Comparison[]; errors: boolean[]; tooMany: boolean }
  }
  let { form, data }: { form?: Form; data: { locale: Locale } } = $props()
  const imageError = $derived(form?.errors?.image ?? '')
  let comparisons = $state<Comparison[]>(untrack(() => form?.comparisons?.rows ?? []))
  let comparisonErrors = $state<boolean[]>(untrack(() => form?.comparisons?.errors ?? []))
  const errorOrder = ['image', 'place', 'title', 'author', 'publisher', 'year', 'page', 'note', 'script', 'ids', 'description'] as const

  function addComparison() {
    comparisons.push(newComparison())
    comparisonErrors.push(false)
  }

  function removeRow(index: number) {
    const next = removeComparison(comparisons, comparisonErrors, index)
    comparisons = next.rows
    comparisonErrors = next.errors
  }

  $effect(() => {
    const invalidRow = comparisonErrors.indexOf(true)
    if (invalidRow !== -1) {
      requestAnimationFrame(() => document.getElementById(`comparison-character-${invalidRow}`)?.focus())
      return
    }
    if (!form?.errors) return
    if (form.errors.form) {
      requestAnimationFrame(() => document.getElementById('form-error')?.focus())
      return
    }
    const first = errorOrder.find(name => form?.errors?.[name])
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus())
  })
</script>

<svelte:head><title>{t(data.locale, 'add.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="form-page">
  <div class="page-heading">
    <h1>{t(data.locale, 'add.title')}</h1>
    <p>{t(data.locale, 'add.intro')}</p>
  </div>
  {#if form?.errors?.form}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{form.errors.form}</p>
  {:else if form?.errors}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{t(data.locale, 'error.fields')}</p>
  {/if}
  <form class="form-panel" method="POST" enctype="multipart/form-data" novalidate>
    <section class="form-section" aria-labelledby="source-heading">
      <h2 class="section-label" id="source-heading">{t(data.locale, 'field.source')}</h2>
      <div class="field">
        <label class="field-label" for="image">{t(data.locale, 'field.sourceImage')}</label>
        <FileField
          id="image"
          name="image"
          label={t(data.locale, 'field.sourceImage')}
          choose={t(data.locale, 'field.chooseImage')}
          browse={t(data.locale, 'field.browseImage')}
          replace={t(data.locale, 'field.replaceImage')}
          remove={t(data.locale, 'field.removeImage')}
          previewAlt={t(data.locale, 'field.imagePreview')}
          hint={t(data.locale, 'field.fileFormats')}
          describedBy={imageError ? 'file-formats image-help image-rights image-error' : 'file-formats image-help image-rights'}
          error={imageError}
        />
        <p class="field-help" id="image-help">{t(data.locale, 'field.sourceImageHint')}</p>
        <p class="field-help" id="image-rights">{t(data.locale, 'field.rightsHint')}</p>
        {#if imageError}<p class="field-error" id="image-error">{imageError}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="place">{t(data.locale, 'field.place')}</label>
        <input id="place" name="place" required maxlength="500" value={form?.values?.place ?? ''} aria-invalid={!!form?.errors?.place} aria-describedby={form?.errors?.place ? 'place-error' : undefined} />
        {#if form?.errors?.place}<p class="field-error" id="place-error">{form.errors.place}</p>{/if}
      </div>
      <details class="details" open={!!(form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page)}>
        <summary>{t(data.locale, 'form.bibliographic')} <span>{t(data.locale, 'form.optional')}</span></summary>
        <div class="details-body">
          <div class="field">
            <label class="field-label" for="title">{t(data.locale, 'field.title')}</label>
            <input id="title" name="title" maxlength="300" value={form?.values?.title ?? ''} aria-invalid={!!form?.errors?.title} aria-describedby={form?.errors?.title ? 'title-error' : undefined} />
            {#if form?.errors?.title}<p class="field-error" id="title-error">{form.errors.title}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="author">{t(data.locale, 'field.author')}</label>
            <input id="author" name="author" maxlength="300" value={form?.values?.author ?? ''} aria-invalid={!!form?.errors?.author} aria-describedby={form?.errors?.author ? 'author-error' : undefined} />
            {#if form?.errors?.author}<p class="field-error" id="author-error">{form.errors.author}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="publisher">{t(data.locale, 'field.publisher')}</label>
            <input id="publisher" name="publisher" maxlength="300" value={form?.values?.publisher ?? ''} aria-invalid={!!form?.errors?.publisher} aria-describedby={form?.errors?.publisher ? 'publisher-error' : undefined} />
            {#if form?.errors?.publisher}<p class="field-error" id="publisher-error">{form.errors.publisher}</p>{/if}
          </div>
          <div class="field-grid">
            <div class="field">
              <label class="field-label" for="year">{t(data.locale, 'field.year')}</label>
              <input id="year" name="year" maxlength="40" value={form?.values?.year ?? ''} aria-invalid={!!form?.errors?.year} aria-describedby={form?.errors?.year ? 'year-error' : undefined} />
              {#if form?.errors?.year}<p class="field-error" id="year-error">{form.errors.year}</p>{/if}
            </div>
            <div class="field">
              <label class="field-label" for="page">{t(data.locale, 'field.page')}</label>
              <input id="page" name="page" maxlength="80" value={form?.values?.page ?? ''} aria-invalid={!!form?.errors?.page} aria-describedby={form?.errors?.page ? 'page-error' : undefined} />
              {#if form?.errors?.page}<p class="field-error" id="page-error">{form.errors.page}</p>{/if}
            </div>
          </div>
        </div>
      </details>
      <div class="field">
        <label class="field-label" for="note">{t(data.locale, 'field.note')}</label>
        <textarea id="note" name="note" maxlength="5000" aria-invalid={!!form?.errors?.note} aria-describedby={form?.errors?.note ? 'note-error' : undefined}>{form?.values?.note ?? ''}</textarea>
        {#if form?.errors?.note}<p class="field-error" id="note-error">{form.errors.note}</p>{/if}
      </div>
    </section>
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field">
        <label class="field-label" for="script">{t(data.locale, 'field.script')}</label>
        <input id="script" name="script" required maxlength="80" value={form?.values?.script ?? 'Han'} aria-invalid={!!form?.errors?.script} aria-describedby={form?.errors?.script ? 'script-error' : undefined} />
        {#if form?.errors?.script}<p class="field-error" id="script-error">{form.errors.script}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="ids">{t(data.locale, 'field.ids')}</label>
        <input id="ids" name="ids" maxlength="200" value={form?.values?.ids ?? ''} aria-invalid={!!form?.errors?.ids} aria-describedby={form?.errors?.ids ? 'ids-error' : undefined} />
        {#if form?.errors?.ids}<p class="field-error" id="ids-error">{form.errors.ids}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="description">{t(data.locale, 'field.description')}</label>
        <textarea id="description" name="description" maxlength="5000" aria-invalid={!!form?.errors?.description} aria-describedby={form?.errors?.description ? 'description-error' : undefined}>{form?.values?.description ?? ''}</textarea>
        {#if form?.errors?.description}<p class="field-error" id="description-error">{form.errors.description}</p>{/if}
      </div>
    </section>
    <p class="field-help">{t(data.locale, 'new.attribution')}</p>
    <section class="form-section" aria-labelledby="related-heading">
      <h2 class="section-label" id="related-heading">{t(data.locale, 'form.related')}</h2>
      <p class="field-help">{t(data.locale, 'form.relatedIntro')}</p>
      {#if comparisons.length > 10}<p class="field-error" role="alert">{t(data.locale, 'error.relatedTooMany')}</p>{/if}
      {#if comparisons.length}
        <div class="comparison-list">
          {#each comparisons as comparison, i}
            <fieldset class="comparison">
              <legend>{t(data.locale, 'form.comparison', { n: i + 1 })}</legend>
              {#if comparisonErrors[i]}<p class="field-error" id={`comparison-error-${i}`} role="alert">{t(data.locale, 'error.comparisonRow')}</p>{/if}
              <div class="comparison-fields">
                <div class="field">
                  <label class="field-label" for={`comparison-character-${i}`}>{t(data.locale, 'field.comparisonCharacter')}</label>
                  <input id={`comparison-character-${i}`} name="comparison_character" required maxlength="200" bind:value={comparison.character} aria-invalid={comparisonErrors[i]} aria-describedby={comparisonErrors[i] ? `comparison-error-${i}` : undefined} />
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-relationship-${i}`}>{t(data.locale, 'field.relationship')}</label>
                  <select id={`comparison-relationship-${i}`} name="comparison_relationship" bind:value={comparison.relationship} aria-invalid={comparisonErrors[i]} aria-describedby={comparisonErrors[i] ? `comparison-error-${i}` : undefined}>
                    <option value="variant">{relationshipLabel(data.locale, 'variant')}</option>
                    <option value="not_variant">{relationshipLabel(data.locale, 'not_variant')}</option>
                    <option value="similar">{relationshipLabel(data.locale, 'similar')}</option>
                    <option value="uncertain">{relationshipLabel(data.locale, 'uncertain')}</option>
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-differences-${i}`}>{t(data.locale, 'field.differences')}</label>
                  <textarea id={`comparison-differences-${i}`} name="comparison_differences" maxlength="2000" bind:value={comparison.differences} aria-invalid={comparisonErrors[i]} aria-describedby={comparisonErrors[i] ? `comparison-error-${i}` : undefined}></textarea>
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-evidence-${i}`}>{t(data.locale, 'field.comparisonEvidence')}</label>
                  <textarea id={`comparison-evidence-${i}`} name="comparison_evidence" maxlength="2000" bind:value={comparison.evidence} aria-invalid={comparisonErrors[i]} aria-describedby={comparisonErrors[i] ? `comparison-error-${i}` : undefined}></textarea>
                </div>
                <div class="comparison-actions">
                  <button class="secondary" type="button" onclick={() => removeRow(i)}>{t(data.locale, 'form.removeComparison')}</button>
                </div>
              </div>
            </fieldset>
          {/each}
        </div>
      {/if}
      <button class="secondary comparison-add" type="button" disabled={comparisons.length >= 10} onclick={addComparison}>{t(data.locale, 'form.addComparison')}</button>
    </section>
    <div class="form-actions">
      <button class="primary" type="submit">{t(data.locale, 'form.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>
</div>
