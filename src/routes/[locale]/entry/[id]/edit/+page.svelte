<script lang="ts">
  import { untrack } from 'svelte'
  import FileField from '$lib/components/FileField.svelte'
  import { newComparison, relationshipLabel, removeComparison } from '$lib/comparison-rows'
  import ScriptSelect from '$lib/components/ScriptSelect.svelte'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import type { Comparison } from '$lib/server/related'

  type Sense = { id?: number; gloss: string; reading: string | null }
  type Genre = { slug: string; label: string }
  type Collection = { slug: string; label: string }
  type Evidence = {
    id: number
    place: string
    url: string | null
    title: string | null
    author: string | null
    publisher: string | null
    year: string | null
    page: string | null
    note: string | null
    has_image: number
    source_id: number | null
  }
  type Entry = {
    id: number
    revision: number
    edit_generation: number
    script: string
    ids: string | null
    description: string | null
    radical: string | null
    encoded_as: string | null
    strokes: number | null
    comparisons: Comparison[]
  }
  type FormState = {
    action?: 'character' | 'evidence' | 'addEvidence'
    evidenceId?: number
    message?: string
    errors?: Record<string, string>
    values?: Record<string, string | string[]>
    comparisons?: { rows: Comparison[]; errors: boolean[]; tooMany: boolean }
    senses?: Sense[]
    revision?: unknown
    generation?: unknown
  }
  let { data, form }: {
    data: {
      locale: Locale
      entry: Entry
      evidence: Evidence[]
      senses: Sense[]
      tags: string[]
      genres: Genre[]
      collections: Collection[]
      allGenres: Genre[]
      allCollections: Collection[]
      allTags: string[]
    }
    form?: FormState
  } = $props()

  const entry = $derived(data.entry)
  const evidence = $derived(data.evidence ?? [])
  const tags = $derived(data.tags ?? [])
  const allGenres = $derived(data.allGenres ?? [])
  const allCollections = $derived(data.allCollections ?? [])
  const allTags = $derived(data.allTags ?? [])
  const current = (name: keyof Entry) => form?.action === 'character' ? String(form.values?.[name] ?? '') : String(entry[name] ?? '')
  const characterError = (name: string) => form?.action === 'character' ? form.errors?.[name] : undefined
  const selectedGenres = $derived(form?.action === 'character' && Array.isArray(form.values?.genres) ? form.values.genres as string[] : (data.genres ?? []).map(genre => genre.slug))
  const selectedCollections = $derived(form?.action === 'character' && Array.isArray(form.values?.collections) ? form.values.collections as string[] : (data.collections ?? []).map(collection => collection.slug))
  let senses = $state<Sense[]>(untrack(() => form?.action === 'character' && Array.isArray(form.senses) ? form.senses.map(sense => ({ gloss: sense.gloss, reading: sense.reading })) : (data.senses ?? [])))
  let comparisons = $state<Comparison[]>(untrack(() => form?.action === 'character' ? form.comparisons?.rows ?? [] : data.entry.comparisons))
  let comparisonErrors = $state<boolean[]>(untrack(() => form?.action === 'character' ? form.comparisons?.errors ?? [] : []))

  function addSense() {
    if (senses.length < 10) senses.push({ gloss: '', reading: '' })
  }
  function removeSense(index: number) {
    senses.splice(index, 1)
  }
  function addComparison() {
    if (comparisons.length >= 10) return
    comparisons.push(newComparison() as Comparison)
    comparisonErrors.push(false)
  }
  function removeRow(index: number) {
    const next = removeComparison(comparisons, comparisonErrors, index)
    comparisons = next.rows
    comparisonErrors = next.errors
  }

  const evidenceValue = (item: Evidence, name: string) => {
    if (form?.action === 'evidence' && form.evidenceId === item.id) return String(form.values?.[name] ?? '')
    return String(item[name as keyof Evidence] ?? '')
  }
  const evidenceError = (item: Evidence, name: string) =>
    form?.action === 'evidence' && form.evidenceId === item.id ? form.errors?.[name] : undefined
  const addValue = (name: string) => form?.action === 'addEvidence' ? String(form.values?.[name] ?? '') : ''
  const addError = (name: string) => form?.action === 'addEvidence' ? form.errors?.[name] : undefined
</script>

<svelte:head><title>{t(data.locale, 'entry.revise')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="form-page">
  <a class="back-link" href={localizedHref(data.locale, `/entry/${entry.id}`)}>← {t(data.locale, 'entry.record', { id: entry.id })}</a>
  <div class="page-heading">
    <h1>{t(data.locale, 'entry.revise')}</h1>
    <p>{t(data.locale, 'edit.intro')}</p>
  </div>
  {#if form?.message}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{form.message}</p>
  {/if}

  <form class="form-panel" method="POST" action="?/character" novalidate>
    <input type="hidden" name="revision" value={form?.action === 'character' ? String(form.revision ?? '') : entry.revision} />
    <input type="hidden" name="edit_generation" value={form?.action === 'character' ? String(form.generation ?? '') : entry.edit_generation} />
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field">
        <label class="field-label" for="script">{t(data.locale, 'field.script')}</label>
        <ScriptSelect id="script" name="script" value={current('script')} invalid={!!characterError('script')} describedBy={characterError('script') ? 'script-error' : undefined} />
        {#if characterError('script')}<p class="field-error" id="script-error">{characterError('script')}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="ids">{t(data.locale, 'field.ids')}</label>
        <input id="ids" name="ids" maxlength="200" value={current('ids')} aria-invalid={!!characterError('ids')} />
        {#if characterError('ids')}<p class="field-error">{characterError('ids')}</p>{/if}
        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="strokes">{t(data.locale, 'field.strokes')}</label>
            <input id="strokes" name="strokes" type="number" min="0" max="199" value={current('strokes')} aria-describedby="strokes-help" />
            <p class="field-help" id="strokes-help">{t(data.locale, 'field.strokesHint')}</p>
          </div>
          <div class="field">
            <label class="field-label" for="radical">{t(data.locale, 'field.radical')}</label>
            <input id="radical" name="radical" maxlength="20" value={current('radical')} />
          </div>
          <div class="field">
            <label class="field-label" for="encoded_as">{t(data.locale, 'field.encodedAs')}</label>
            <input id="encoded_as" name="encoded_as" maxlength="80" value={current('encoded_as')} />
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="tags">{t(data.locale, 'field.tags')}</label>
          <input id="tags" name="tags" maxlength="400" list="tag-suggestions" value={form?.action === 'character' ? String(form.values?.tags ?? '') : tags.join(', ')} aria-describedby="tags-help" />
          <datalist id="tag-suggestions">{#each allTags as tag}<option value={tag}></option>{/each}</datalist>
          <p class="field-help" id="tags-help">{t(data.locale, 'field.tagsHint')}</p>
        </div>
        {#if allGenres.length}
          <fieldset class="field genre-field">
            <legend class="field-label">{t(data.locale, 'field.genre')}</legend>
            <div class="genre-options">
              {#each allGenres as genre (genre.slug)}
                <label class="genre-option"><input type="checkbox" name="genre" value={genre.slug} checked={selectedGenres.includes(genre.slug)} /> {genre.label}</label>
              {/each}
            </div>
          </fieldset>
        {/if}
        {#if allCollections.length}
          <fieldset class="field genre-field">
            <legend class="field-label">{t(data.locale, 'field.collection')}</legend>
            <div class="genre-options">
              {#each allCollections as collection (collection.slug)}
                <label class="genre-option"><input type="checkbox" name="collection" value={collection.slug} checked={selectedCollections.includes(collection.slug)} /> {collection.label}</label>
              {/each}
            </div>
          </fieldset>
        {/if}
      </div>
      <div class="field">
        <label class="field-label" for="description">{t(data.locale, 'field.description')}</label>
        <textarea id="description" name="description" maxlength="5000" aria-invalid={!!characterError('description')} aria-describedby={characterError('description') ? 'description-error' : undefined}>{current('description')}</textarea>
        {#if characterError('description')}<p class="field-error" id="description-error">{characterError('description')}</p>{/if}
      </div>
    </section>

    <section class="form-section" aria-labelledby="senses-heading">
      <h2 class="section-label" id="senses-heading">{t(data.locale, 'field.senses')}</h2>
      {#each senses as sense, i}
        <div class="sense-row">
          <div class="field">
            <label class="field-label" for={`sense-gloss-${i}`}>{t(data.locale, 'field.senseGloss')}</label>
            <input id={`sense-gloss-${i}`} name="sense_gloss" maxlength="500" bind:value={sense.gloss} />
          </div>
          <div class="field">
            <label class="field-label" for={`sense-reading-${i}`}>{t(data.locale, 'field.senseReading')}</label>
            <input id={`sense-reading-${i}`} name="sense_reading" maxlength="200" bind:value={sense.reading} />
          </div>
          <button class="secondary" type="button" onclick={() => removeSense(i)}>{t(data.locale, 'sense.remove')}</button>
        </div>
      {/each}
      {#if characterError('senses')}<p class="field-error">{characterError('senses')}</p>{/if}
      <button class="secondary" type="button" disabled={senses.length >= 10} onclick={addSense}>{t(data.locale, 'sense.add')}</button>
    </section>

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
                  <input id={`comparison-character-${i}`} name="comparison_character" maxlength="200" bind:value={comparison.character} aria-invalid={comparisonErrors[i]} />
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-relationship-${i}`}>{t(data.locale, 'field.relationship')}</label>
                  <select id={`comparison-relationship-${i}`} name="comparison_relationship" bind:value={comparison.relationship}>
                    {#each ['variant', 'not_variant', 'similar', 'sound', 'meaning', 'glyph', 'usage', 'uncertain'] as relationship}
                      <option value={relationship}>{relationshipLabel(data.locale, relationship)}</option>
                    {/each}
                  </select>
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-differences-${i}`}>{t(data.locale, 'field.differences')}</label>
                  <textarea id={`comparison-differences-${i}`} name="comparison_differences" maxlength="2000" bind:value={comparison.differences}></textarea>
                </div>
                <div class="field">
                  <label class="field-label" for={`comparison-evidence-${i}`}>{t(data.locale, 'field.comparisonEvidence')}</label>
                  <textarea id={`comparison-evidence-${i}`} name="comparison_evidence" maxlength="2000" bind:value={comparison.evidence}></textarea>
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
      <button class="primary" type="submit">{t(data.locale, 'edit.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>

  <section class="evidence-section" aria-labelledby="evidence-heading">
    <div class="page-heading">
      <h2 class="section-label" id="evidence-heading">{t(data.locale, 'entry.sightings')}</h2>
      <p>{t(data.locale, 'entry.addSightingHint')}</p>
    </div>
    {#each evidence as item (item.id)}
      <form class="form-panel evidence-form" id={`evidence-${item.id}`} method="POST" action="?/evidence" enctype="multipart/form-data" novalidate>
        <input type="hidden" name="evidence" value={item.id} />
        <input type="hidden" name="revision" value={form?.action === 'evidence' && form.evidenceId === item.id ? String(form.revision ?? '') : entry.revision} />
        <input type="hidden" name="edit_generation" value={form?.action === 'evidence' && form.evidenceId === item.id ? String(form.generation ?? '') : entry.edit_generation} />
        {#if form?.action === 'evidence' && form.evidenceId === item.id && form.message}
          <p class="notice error" role="alert">{form.message}</p>
        {/if}
        {#if item.has_image}
          <figure class="current-image">
            <img src={localizedHref(data.locale, `/entry/${entry.id}/evidence/${item.id}/image`)} alt={item.place || t(data.locale, 'field.sourceImage')} />
            <figcaption>{t(data.locale, 'evidence.current')}</figcaption>
          </figure>
          <label class="check"><input type="checkbox" name="remove_image" value="1" /> {t(data.locale, 'field.removeImage')}</label>
        {/if}
        <div class="field">
          <label class="field-label" for={`image-${item.id}`}>{t(data.locale, 'field.sourceImage')}</label>
          <FileField
            id={`image-${item.id}`}
            name="image"
            label={t(data.locale, 'field.sourceImage')}
            choose={t(data.locale, 'field.chooseImage')}
            browse={t(data.locale, 'field.browseImage')}
            replace={t(data.locale, 'field.replaceImage')}
            remove={t(data.locale, 'field.removeImage')}
            previewAlt={t(data.locale, 'field.imagePreview')}
            hint={t(data.locale, 'field.fileFormats')}
            hintId={`formats-${item.id}`}
            describedBy={`formats-${item.id} evidence-keep-${item.id}`}
            error={evidenceError(item, 'image') ?? ''}
          />
          <p class="field-help" id={`evidence-keep-${item.id}`}>{t(data.locale, 'evidence.keepImage')}</p>
        </div>
        <div class="field">
          <label class="field-label" for={`url-${item.id}`}>{t(data.locale, 'field.url')}</label>
          <input id={`url-${item.id}`} name="url" type="url" maxlength="1000" placeholder="https://" value={evidenceValue(item, 'url')} aria-invalid={!!evidenceError(item, 'url')} aria-describedby={`url-help-${item.id}`} />
          <p class="field-help" id={`url-help-${item.id}`}>{t(data.locale, 'field.urlHint')}</p>
          {#if evidenceError(item, 'url')}<p class="field-error">{evidenceError(item, 'url')}</p>{/if}
        </div>
        <div class="field">
          <label class="field-label" for={`place-${item.id}`}>{t(data.locale, 'field.place')}</label>
          <input id={`place-${item.id}`} name="place" required maxlength="500" value={evidenceValue(item, 'place')} aria-invalid={!!evidenceError(item, 'place')} />
          {#if evidenceError(item, 'place')}<p class="field-error">{evidenceError(item, 'place')}</p>{/if}
        </div>
        <div class="field-grid">
          <div class="field"><label class="field-label" for={`title-${item.id}`}>{t(data.locale, 'field.title')}</label><input id={`title-${item.id}`} name="title" maxlength="300" value={evidenceValue(item, 'title')} /></div>
          <div class="field"><label class="field-label" for={`author-${item.id}`}>{t(data.locale, 'field.author')}</label><input id={`author-${item.id}`} name="author" maxlength="300" value={evidenceValue(item, 'author')} /></div>
          <div class="field"><label class="field-label" for={`publisher-${item.id}`}>{t(data.locale, 'field.publisher')}</label><input id={`publisher-${item.id}`} name="publisher" maxlength="300" value={evidenceValue(item, 'publisher')} /></div>
          <div class="field"><label class="field-label" for={`year-${item.id}`}>{t(data.locale, 'field.year')}</label><input id={`year-${item.id}`} name="year" maxlength="40" placeholder="1998 / 1998-05 / 1998-05-12 / 05" value={evidenceValue(item, 'year')} /></div>
          <div class="field"><label class="field-label" for={`page-${item.id}`}>{t(data.locale, 'field.page')}</label><input id={`page-${item.id}`} name="page" maxlength="80" value={evidenceValue(item, 'page')} /></div>
        </div>
        <div class="field"><label class="field-label" for={`note-${item.id}`}>{t(data.locale, 'field.note')}</label><textarea id={`note-${item.id}`} name="note" maxlength="5000">{evidenceValue(item, 'note')}</textarea></div>
        <div class="form-actions"><button class="secondary" type="submit">{t(data.locale, 'evidence.save')}</button></div>
      </form>
    {/each}

    <form class="form-panel evidence-form" method="POST" action="?/addEvidence" enctype="multipart/form-data" novalidate>
      {#if form?.action === 'addEvidence' && form.message}
        <p class="notice error" role="alert">{form.message}</p>
      {/if}
      <h2 class="section-label">{t(data.locale, 'entry.addSighting')}</h2>
      <div class="field">
        <label class="field-label" for="new-image">{t(data.locale, 'field.sourceImage')}</label>
        <FileField
          id="new-image"
          name="image"
          label={t(data.locale, 'field.sourceImage')}
          choose={t(data.locale, 'field.chooseImage')}
          browse={t(data.locale, 'field.browseImage')}
          replace={t(data.locale, 'field.replaceImage')}
          remove={t(data.locale, 'field.removeImage')}
          previewAlt={t(data.locale, 'field.imagePreview')}
          hint={t(data.locale, 'field.fileFormats')}
          hintId="new-formats"
          describedBy="new-formats"
          error={addError('image') ?? ''}
        />
      </div>
      <div class="field">
        <label class="field-label" for="new-url">{t(data.locale, 'field.url')}</label>
        <input id="new-url" name="url" type="url" maxlength="1000" placeholder="https://" value={addValue('url')} aria-invalid={!!addError('url')} aria-describedby="new-url-help" />
        <p class="field-help" id="new-url-help">{t(data.locale, 'field.urlHint')}</p>
        {#if addError('url')}<p class="field-error">{addError('url')}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="new-place">{t(data.locale, 'field.place')}</label>
        <input id="new-place" name="place" required maxlength="500" value={addValue('place')} aria-invalid={!!addError('place')} />
        {#if addError('place')}<p class="field-error">{addError('place')}</p>{/if}
      </div>
      <div class="field-grid">
        <div class="field"><label class="field-label" for="new-title">{t(data.locale, 'field.title')}</label><input id="new-title" name="title" maxlength="300" value={addValue('title')} /></div>
        <div class="field"><label class="field-label" for="new-author">{t(data.locale, 'field.author')}</label><input id="new-author" name="author" maxlength="300" value={addValue('author')} /></div>
        <div class="field"><label class="field-label" for="new-publisher">{t(data.locale, 'field.publisher')}</label><input id="new-publisher" name="publisher" maxlength="300" value={addValue('publisher')} /></div>
        <div class="field"><label class="field-label" for="new-year">{t(data.locale, 'field.year')}</label><input id="new-year" name="year" maxlength="40" placeholder="1998 / 1998-05 / 1998-05-12 / 05" value={addValue('year')} /></div>
        <div class="field"><label class="field-label" for="new-page">{t(data.locale, 'field.page')}</label><input id="new-page" name="page" maxlength="80" value={addValue('page')} /></div>
      </div>
      <div class="field"><label class="field-label" for="new-note">{t(data.locale, 'field.note')}</label><textarea id="new-note" name="note" maxlength="5000">{addValue('note')}</textarea></div>
      <div class="form-actions"><button class="secondary" type="submit">{t(data.locale, 'entry.addSighting')}</button></div>
    </form>
  </section>
</div>

<style>
  .evidence-section { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-8) }
  .evidence-form { display: flex; flex-direction: column; gap: var(--space-4) }
  .sense-row { display: grid; grid-template-columns: 1fr 1fr auto; align-items: end; gap: var(--space-3) }
  .current-image { margin: 0; display: flex; flex-direction: column; gap: 6px }
  .current-image img { display: block; max-width: 100%; max-height: 45vh; object-fit: contain; border-radius: var(--radius-sm); background: var(--surface-sunken) }
  .current-image figcaption { color: var(--muted); font-size: var(--text-xs) }
  .check { display: flex; align-items: center; gap: 8px; font-size: 14px }
  @media (max-width: 700px) { .sense-row { grid-template-columns: 1fr } }
</style>
