<script lang="ts">
  import { enhance } from '$app/forms'
  import { untrack } from 'svelte'
  import FileField from '$lib/components/FileField.svelte'
  import { newComparison, relationshipLabel, removeComparison } from '$lib/comparison-rows'
  import { handleContributionResult } from '$lib/contribution-result'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import partsUrl from 'ids-input/data/han-parts.json.gz?url'
  import { estimateStrokes } from '$lib/strokes'

  type Values = Record<string, string> & { genres?: string[]; collections?: string[] }
  type Comparison = { character: string; relationship: string; differences: string; evidence: string }
  type Suggestion = { ids: string; script: string }
  type Genre = { slug: string; label: string }
  type Collection = { slug: string; label: string }
  type Form = {
    errors?: Record<string, string>
    values?: Values
    comparisons?: { rows: Comparison[]; errors: boolean[]; tooMany: boolean }
  }
  let { form, data }: { form?: Form; data: { locale: Locale; suggestions?: Suggestion[]; genres?: Genre[]; collections?: Collection[]; tags?: string[] } } = $props()
  let rateLimitFailure = $state<429 | 503 | null>(null)
  const imageError = $derived(form?.errors?.image ?? '')
  let comparisons = $state<Comparison[]>(untrack(() => form?.comparisons?.rows ?? []))
  let comparisonErrors = $state<boolean[]>(untrack(() => form?.comparisons?.errors ?? []))
  // A failed submission seeds the fields once; after that the reader's edits own them.
  let script = $state(untrack(() => form?.values?.script ?? 'Han'))
  let ids = $state(untrack(() => form?.values?.ids ?? ''))
  let senses = $state([{ gloss: '', reading: '' }])
  let strokes = $state(String(untrack(() => form?.values?.strokes ?? '')))
  let strokeCounts = $state.raw<Map<string, number | null> | null>(null)
  let strokeGeneration = 0
  async function loadStrokeCounts() {
    if (strokeCounts) return strokeCounts
    const response = await fetch(partsUrl)
    const text = await new Response(new Blob([await response.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    const data = JSON.parse(text) as { keys: string[]; strokes: (number | null)[] }
    strokeCounts = new Map(data.keys.map((key, index) => [key, data.strokes[index] ?? null]))
    return strokeCounts
  }
  $effect(() => {
    const value = ids
    const generation = ++strokeGeneration
    if (!value) return
    loadStrokeCounts().then(counts => {
      if (generation !== strokeGeneration) return
      const estimate = estimateStrokes(value, counts)
      if (estimate) strokes = String(estimate.strokes)
    }).catch(() => {})
  })
  // A validation notice belongs to the section that holds the failing field.
  const optionalError = $derived(!!(form?.errors?.description || form?.errors?.note || form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page))
  const errorOrder = ['image', 'place', 'script', 'ids', 'description', 'note', 'title', 'author', 'publisher', 'year', 'page'] as const
  const operators = new Set([...'⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻'])
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
    <p><a class="text-link" href={localizedHref(data.locale, '/batch')}>{t(data.locale, 'batch.link')}</a></p>
  </div>
  {#if form?.errors?.form}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{form.errors.form}</p>
  {:else if form?.errors}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{t(data.locale, 'error.fields')}</p>
  {/if}
  {#if rateLimitFailure}
    <p class="notice error" role="alert">{rateLimitFailure === 429 ? t(data.locale, 'error.rateLimit') : t(data.locale, 'error.rateUnavailable')}</p>
  {/if}
  <form class="form-panel" method="POST" enctype="multipart/form-data" novalidate use:enhance={() => {
    rateLimitFailure = null
    return async ({ result, update }) => handleContributionResult(result, status => { rateLimitFailure = status }, update)
  }}>
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
        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="strokes">{t(data.locale, 'field.strokes')}</label>
            <input id="strokes" name="strokes" type="number" min="0" max="199" bind:value={strokes} aria-describedby="strokes-help" />
            <p class="field-help" id="strokes-help">{t(data.locale, 'field.strokesHint')}</p>
          </div>
          <div class="field">
            <label class="field-label" for="radical">{t(data.locale, 'field.radical')}</label>
            <input id="radical" name="radical" maxlength="20" value={form?.values?.radical ?? ''} />
          </div>
          <div class="field">
            <label class="field-label" for="encoded_as">{t(data.locale, 'field.encodedAs')}</label>
            <input id="encoded_as" name="encoded_as" maxlength="80" value={form?.values?.encoded_as ?? ''} />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="tags">{t(data.locale, 'field.tags')}</label>
          <input id="tags" name="tags" maxlength="400" list="tag-suggestions" value={form?.values?.tags ?? ''} aria-describedby="tags-help" />
          <datalist id="tag-suggestions">{#each data.tags ?? [] as tag}<option value={tag}></option>{/each}</datalist>
          <p class="field-help" id="tags-help">{t(data.locale, 'field.tagsHint')}</p>
        </div>
        {#if data.genres?.length}
          <fieldset class="field genre-field">
            <legend class="field-label">{t(data.locale, 'field.genre')}</legend>
            <div class="genre-options">
              {#each data.genres as genre (genre.slug)}
                <label class="genre-option"><input type="checkbox" name="genre" value={genre.slug} checked={form?.values?.genres?.includes(genre.slug)} /> {genre.label}</label>
              {/each}
            </div>
          </fieldset>
        {/if}
        {#if data.collections?.length}
          <fieldset class="field genre-field">
            <legend class="field-label">{t(data.locale, 'field.collection')}</legend>
            <div class="genre-options">
              {#each data.collections as collection (collection.slug)}
                <label class="genre-option"><input type="checkbox" name="collection" value={collection.slug} checked={form?.values?.collections?.includes(collection.slug)} /> {collection.label}</label>
              {/each}
            </div>
          </fieldset>
        {/if}
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
        <fieldset class="field">
          <legend class="field-label">{t(data.locale, 'field.senses')}</legend>
          {#each senses as sense, i}
            <div class="field-grid">
              <div class="field"><label class="field-label" for={`sense-gloss-${i}`}>{t(data.locale, 'field.senseGloss')}</label><input id={`sense-gloss-${i}`} name="sense_gloss" maxlength="500" bind:value={sense.gloss} /></div>
              <div class="field"><label class="field-label" for={`sense-reading-${i}`}>{t(data.locale, 'field.senseReading')}</label><input id={`sense-reading-${i}`} name="sense_reading" maxlength="200" bind:value={sense.reading} /></div>
            </div>
            {#if senses.length > 1}<button class="secondary" type="button" onclick={() => senses.splice(i, 1)}>{t(data.locale, 'sense.remove')}</button>{/if}
          {/each}
          <button class="secondary" type="button" onclick={() => senses.push({ gloss: '', reading: '' })}>{t(data.locale, 'sense.add')}</button>
        </fieldset>
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
            <input id="year" name="year" maxlength="40" placeholder="1998 / 1998-05 / 1998-05-12 / 05" value={form?.values?.year ?? ''} aria-invalid={!!form?.errors?.year} aria-describedby={form?.errors?.year ? 'year-help year-error' : 'year-help'} />
            <p class="field-help" id="year-help">{t(data.locale, 'field.dateHint')}</p>
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
                    <option value="sound">{relationshipLabel(data.locale, 'sound')}</option>
                    <option value="meaning">{relationshipLabel(data.locale, 'meaning')}</option>
                    <option value="glyph">{relationshipLabel(data.locale, 'glyph')}</option>
                    <option value="usage">{relationshipLabel(data.locale, 'usage')}</option>
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
