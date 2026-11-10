<script lang="ts">
  import { enhance } from '$app/forms'
  import { untrack } from 'svelte'
  import ComparisonGrid from '$lib/components/ComparisonGrid.svelte'
  import FileField from '$lib/components/FileField.svelte'
  import ScriptSelect from '$lib/components/ScriptSelect.svelte'
  import type { Comparison } from '$lib/comparison-rows'
  import { handleContributionResult } from '$lib/contribution-result'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import { DEFAULT_SCRIPT } from '$lib/script'
  import partsUrl from 'ids-input/data/han-parts.json.gz?url'
  import { estimateStrokes } from '$lib/strokes'

  type Values = Record<string, string> & { genres?: string[]; collections?: string[] }
  type Suggestion = { ids: string; script: string }
  type Genre = { slug: string; label: string; parent: string | null }
  type Collection = { slug: string; label: string }
  type Form = {
    errors?: Record<string, string>
    values?: Values
    comparisons?: { rows: Comparison[] }
  }
  let { form, data }: { form?: Form; data: { locale: Locale; suggestions?: Suggestion[]; genres?: Genre[]; collections?: Collection[]; tags?: string[] } } = $props()
  const topGenres = $derived((data.genres ?? []).filter(genre => !genre.parent && genre.slug !== 'dialect'))
  const dialect = $derived((data.genres ?? []).find(genre => genre.slug === 'dialect'))
  const dialectGenres = $derived((data.genres ?? []).filter(genre => genre.parent === 'dialect'))
  let rateLimitFailure = $state<429 | 503 | null>(null)
  const imageError = $derived(form?.errors?.image ?? '')
  // A failed submission seeds the fields once; after that the reader's edits own them.
  let script = $state(untrack(() => form?.values?.script ?? DEFAULT_SCRIPT))
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
  const errorOrder = ['image', 'url', 'place', 'note', 'title', 'author', 'publisher', 'year', 'page', 'script', 'ids', 'description'] as const
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

  $effect(() => {
    if (!form?.errors) return
    if (form.errors.form) {
      requestAnimationFrame(() => document.getElementById('form-error')?.focus())
      return
    }
    if (form.errors.comparison) {
      requestAnimationFrame(() => document.getElementById('comparison-variant-0')?.focus())
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
    <section class="form-section" aria-labelledby="evidence-heading">
      <h2 class="section-label" id="evidence-heading">{t(data.locale, 'form.evidence')}</h2>
      <div class="field">
        <label class="field-label" for="image">{t(data.locale, 'field.sourceImage')}</label>
        <FileField
          id="image"
          name="image"
          optional
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
        <label class="field-label" for="url">{t(data.locale, 'field.url')}</label>
        <input id="url" name="url" type="url" maxlength="1000" placeholder="https://" value={form?.values?.url ?? ''} aria-invalid={!!form?.errors?.url} aria-describedby="url-help" />
        <p class="field-help" id="url-help">{t(data.locale, 'field.urlHint')}</p>
        {#if form?.errors?.url}<p class="field-error">{form.errors.url}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="place">{t(data.locale, 'field.place')}</label>
        <input id="place" name="place" maxlength="500" value={form?.values?.place ?? ''} aria-invalid={!!form?.errors?.place} aria-describedby={form?.errors?.place ? 'place-error' : undefined} />
        {#if form?.errors?.place}<p class="field-error" id="place-error">{form.errors.place}</p>{/if}
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
      <div class="field-grid">
        <div class="field">
          <label class="field-label" for="provider">{t(data.locale, 'field.provider')}</label>
          <input id="provider" name="provider" maxlength="300" value={form?.values?.provider ?? ''} aria-invalid={!!form?.errors?.provider} aria-describedby={form?.errors?.provider ? 'provider-error' : undefined} />
          {#if form?.errors?.provider}<p class="field-error" id="provider-error">{form.errors.provider}</p>{/if}
        </div>
        <div class="field">
          <label class="field-label" for="provider_url">{t(data.locale, 'field.providerUrl')}</label>
          <input id="provider_url" name="provider_url" type="url" maxlength="1000" placeholder="https://" value={form?.values?.provider_url ?? ''} aria-invalid={!!form?.errors?.provider_url} aria-describedby={form?.errors?.provider_url ? 'provider-url-error' : undefined} />
          {#if form?.errors?.provider_url}<p class="field-error" id="provider-url-error">{form.errors.provider_url}</p>{/if}
        </div>
      </div>
    </section>
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field">
        <label class="field-label" for="script">{t(data.locale, 'field.script')}</label>
        <ScriptSelect bind:value={script} invalid={!!form?.errors?.script} describedBy={form?.errors?.script ? 'script-error' : undefined} />
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
          <label class="field-label" for="ivd_status">{t(data.locale, 'field.ivd')}</label>
          <select id="ivd_status" name="ivd_status" value={form?.values?.ivd_status ?? ''} aria-invalid={!!form?.errors?.ivd_sequence} aria-describedby={form?.errors?.ivd_sequence ? 'ivd-help ivd_sequence-error' : 'ivd-help'}>
            <option value="">{t(data.locale, 'field.ivdUnstated')}</option>
            <option value="registered">{t(data.locale, 'field.ivdRegistered')}</option>
            <option value="none">{t(data.locale, 'field.ivdNone')}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="ivd_sequence">{t(data.locale, 'field.ivdSequence')}</label>
          <input id="ivd_sequence" name="ivd_sequence" maxlength="80" value={form?.values?.ivd_sequence ?? ''} aria-invalid={!!form?.errors?.ivd_sequence} aria-describedby={form?.errors?.ivd_sequence ? 'ivd-help ivd_sequence-error' : 'ivd-help'} />
          <p class="field-help" id="ivd-help">{t(data.locale, 'field.ivdHint')}</p>
          {#if form?.errors?.ivd_sequence}<p class="field-error" id="ivd_sequence-error">{form.errors.ivd_sequence}</p>{/if}
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
              {#each topGenres as genre (genre.slug)}
                <label class="genre-option">
                  <input type="checkbox" name="genre" value={genre.slug} checked={form?.values?.genres?.includes(genre.slug)} />
                  <span class="genre-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{genre.label}
                </label>
              {/each}
            </div>
            {#if dialect && dialectGenres.length}
              <div class="genre-group">
                <label class="genre-option genre-option-parent">
                  <input type="checkbox" name="genre" value={dialect.slug} checked={form?.values?.genres?.includes(dialect.slug)} />
                  <span class="genre-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{dialect.label}
                </label>
                <div class="genre-options">
                  {#each dialectGenres as genre (genre.slug)}
                    <label class="genre-option">
                      <input type="checkbox" name="genre" value={genre.slug} checked={form?.values?.genres?.includes(genre.slug)} />
                      <span class="genre-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{genre.label}
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          </fieldset>
        {/if}
        {#if data.collections?.length}
          <fieldset class="field genre-field">
            <legend class="field-label">{t(data.locale, 'field.collection')}</legend>
            <div class="genre-options">
              {#each data.collections as collection (collection.slug)}
                <label class="genre-option">
                  <input type="checkbox" name="collection" value={collection.slug} checked={form?.values?.collections?.includes(collection.slug)} />
                  <span class="genre-box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span>{collection.label}
                </label>
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
    </section>
    <p class="field-help">{t(data.locale, 'new.attribution')}</p>
    <section class="form-section" aria-labelledby="related-heading">
      <h2 class="section-label" id="related-heading">{t(data.locale, 'form.related')}</h2>
      <p class="field-help">{t(data.locale, 'form.relatedIntro')}</p>
      {#if form?.errors?.comparison}<p class="field-error" id="comparison-error" role="alert">{form.errors.comparison}</p>{/if}
      <ComparisonGrid locale={data.locale} rows={form?.comparisons?.rows ?? []} invalid={!!form?.errors?.comparison} describedBy={form?.errors?.comparison ? 'comparison-error' : undefined} />
    </section>
    <div class="form-actions">
      <button class="primary" type="submit">{t(data.locale, 'form.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>
</div>
