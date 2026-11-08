<script lang="ts">
  import FileField from '$lib/components/FileField.svelte'
  import { t, type Locale } from '$lib/i18n'

  type Suggestion = { ids: string; script: string }
  type Values = Record<string, string>
  let {
    form,
    data,
  }: {
    form?: { errors?: Record<string, string>; values?: Values }
    data: { locale: Locale; suggestions?: Suggestion[] }
  } = $props()

  // The form values seed the fields once; after that the reader's edits own them.
  // svelte-ignore state_referenced_locally
  let script = $state(form?.values?.script ?? 'Han')
  // svelte-ignore state_referenced_locally
  let ids = $state(form?.values?.ids ?? '')
  const imageError = $derived(form?.errors?.image ?? '')
  const errorOrder = ['image', 'place', 'script', 'ids', 'description', 'note', 'title', 'author', 'publisher', 'year', 'page'] as const
  const operators = new Set([...'⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻'])
  const optionalError = $derived(!!(form?.errors?.description || form?.errors?.note || form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page))

  const suggestions = $derived(related(data.suggestions ?? [], ids))

  function related(entries: Suggestion[], value: string): Suggestion[] {
    const characters = [...value].filter(character => !operators.has(character) && !/\s/.test(character))
    if (!characters.length) return []
    const seen = new Set<string>()
    return entries
      .filter(entry => entry.ids && (entry.ids === value || characters.some(character => entry.ids.includes(character))))
      .filter(entry => {
        const key = `${entry.ids}\u0000${entry.script}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 6)
  }

  function useSuggestion(suggestion: Suggestion) {
    ids = suggestion.ids
    script = suggestion.script
    requestAnimationFrame(() => document.getElementById('ids')?.focus())
  }

  $effect(() => {
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
        <span class="field-label">{t(data.locale, 'field.sourceImage')}</span>
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
    </section>
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field">
        <label class="field-label" for="script">{t(data.locale, 'field.script')}</label>
        <input id="script" name="script" required maxlength="80" bind:value={script} aria-invalid={!!form?.errors?.script} aria-describedby={form?.errors?.script ? 'script-error' : undefined} />
        {#if form?.errors?.script}<p class="field-error" id="script-error">{form.errors.script}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="ids">{t(data.locale, 'field.ids')}</label>
        <input id="ids" name="ids" maxlength="200" bind:value={ids} aria-invalid={!!form?.errors?.ids} aria-describedby={form?.errors?.ids ? 'ids-error' : suggestions.length ? 'ids-help' : undefined} />
        {#if form?.errors?.ids}<p class="field-error" id="ids-error">{form.errors.ids}</p>{/if}
        {#if suggestions.length}
          <div class="suggestions">
            <p class="field-help suggestions-title">{t(data.locale, 'field.suggestions')}</p>
            <p class="field-help" id="ids-help" aria-live="polite">{t(data.locale, 'field.suggestionHint')}</p>
            <div class="suggestion-list">
              {#each suggestions as suggestion}
                <button class="suggestion" type="button" onclick={() => useSuggestion(suggestion)}>
                  <span class="suggestion-ids">{suggestion.ids}</span>
                  <span class="suggestion-script">{suggestion.script}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </section>
    <details class="details" open={optionalError}>
      <summary>{t(data.locale, 'field.moreDetails')} <span>{t(data.locale, 'form.optional')}</span></summary>
      <div class="details-body">
        <div class="field">
          <label class="field-label" for="description">{t(data.locale, 'field.description')}</label>
          <textarea id="description" name="description" maxlength="5000" aria-invalid={!!form?.errors?.description} aria-describedby={form?.errors?.description ? 'description-error' : undefined}>{form?.values?.description ?? ''}</textarea>
          {#if form?.errors?.description}<p class="field-error" id="description-error">{form.errors.description}</p>{/if}
        </div>
        <div class="field">
          <label class="field-label" for="note">{t(data.locale, 'field.note')}</label>
          <textarea id="note" name="note" maxlength="5000" aria-invalid={!!form?.errors?.note} aria-describedby={form?.errors?.note ? 'note-error' : undefined}>{form?.values?.note ?? ''}</textarea>
          {#if form?.errors?.note}<p class="field-error" id="note-error">{form.errors.note}</p>{/if}
        </div>
        <div class="field-grid">
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
    <div class="form-actions">
      <button class="primary" type="submit">{t(data.locale, 'form.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>
</div>
