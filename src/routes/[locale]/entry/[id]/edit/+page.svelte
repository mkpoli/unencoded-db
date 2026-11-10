<script lang="ts">
  import { untrack } from 'svelte'
  import FileField from '$lib/components/FileField.svelte'
  import { cleanLinkInput } from '$lib/link-input'
  import type { PostInfo } from '$lib/source-url'
  import ComparisonGrid from '$lib/components/ComparisonGrid.svelte'
  import EncodingFields from '$lib/components/EncodingFields.svelte'
  import ScriptSelect from '$lib/components/ScriptSelect.svelte'
  import { localizedHref, t, type Locale } from '$lib/i18n'
  import type { Comparison } from '$lib/comparison-rows'
  import type { Encoding } from '$lib/encodings'

  type Sense = { id?: number; gloss: string; reading: string | null }
  type Genre = { slug: string; label: string }
  type Collection = { slug: string; label: string }
  type Evidence = {
    id: number
    place: string
    url: string | null
    provider: string | null
    provider_url: string | null
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
    ivd_status: 'registered' | 'none' | null
    ivd_sequence: string | null
    comparisons: Comparison[]
  }
  type FormState = {
    action?: 'character' | 'evidence' | 'addEvidence'
    evidenceId?: number
    message?: string
    errors?: Record<string, string>
    values?: Record<string, string | string[] | Encoding[]>
    comparisons?: { rows: Comparison[] }
    senses?: Sense[]
    revision?: unknown
    generation?: unknown
    ivd_status?: string
    ivd_sequence?: string
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
      encodings: Encoding[]
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
  let comparisons = $state<Comparison[]>(untrack(() => form?.action === 'character' ? form.comparisons?.rows ?? [] : (data.entry.comparisons ?? [])))

  function addSense() {
    if (senses.length < 10) senses.push({ gloss: '', reading: '' })
  }
  function removeSense(index: number) {
    senses.splice(index, 1)
  }

  const evidenceValue = (item: Evidence, name: string) => {
    if (form?.action === 'evidence' && form.evidenceId === item.id) return String(form.values?.[name] ?? '')
    return String(item[name as keyof Evidence] ?? '')
  }
  const evidenceError = (item: Evidence, name: string) =>
    form?.action === 'evidence' && form.evidenceId === item.id ? form.errors?.[name] : undefined
  const addValue = (name: string) => form?.action === 'addEvidence' ? String(form.values?.[name] ?? '') : ''
  const addError = (name: string) => form?.action === 'addEvidence' ? form.errors?.[name] : undefined
  let addUrl = $state(untrack(() => form?.action === 'addEvidence' ? String(form.values?.url ?? '') : ''))
  let addPlace = $state(untrack(() => addValue('place')))
  let addTitle = $state(untrack(() => addValue('title')))
  let addProvider = $state(untrack(() => addValue('provider')))
  let addProviderUrl = $state(untrack(() => addValue('provider_url')))
  let addedPost: PostInfo | null = null

  // Fill the citation fields from the post unless the reader has changed them since the last link.
  function fillAddFromPost(info: PostInfo | null) {
    const previous = addedPost
    const keep = (current: string, name: keyof PostInfo) => {
      const before = previous?.[name]
      return !current || (before !== null && before !== undefined && current === before) ? String(info?.[name] ?? '') : current
    }
    addPlace = keep(addPlace, 'place')
    addTitle = keep(addTitle, 'title')
    addProvider = keep(addProvider, 'provider')
    addProviderUrl = keep(addProviderUrl, 'providerUrl')
    addedPost = info
  }
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
        </div>
        <EncodingFields
          locale={data.locale}
          values={form?.action === 'character' && Array.isArray(form.values?.encodings) ? form.values.encodings as Encoding[] : data.encodings}
          error={characterError('encodings')}
        />
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
      <div class="field-grid">
        <div class="field">
          <label class="field-label" for="ivd_status">{t(data.locale, 'field.ivd')}</label>
          <select id="ivd_status" name="ivd_status" value={form?.ivd_status ?? entry.ivd_status ?? ''} aria-invalid={!!characterError('ivd_sequence')} aria-describedby={characterError('ivd_sequence') ? 'ivd-help ivd_sequence-error' : 'ivd-help'}>
            <option value="">{t(data.locale, 'field.ivdUnstated')}</option>
            <option value="registered">{t(data.locale, 'field.ivdRegistered')}</option>
            <option value="none">{t(data.locale, 'field.ivdNone')}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="ivd_sequence">{t(data.locale, 'field.ivdSequence')}</label>
          <input id="ivd_sequence" name="ivd_sequence" maxlength="80" value={form?.ivd_sequence ?? entry.ivd_sequence ?? ''} aria-invalid={!!characterError('ivd_sequence')} aria-describedby={characterError('ivd_sequence') ? 'ivd-help ivd_sequence-error' : 'ivd-help'} />
          <p class="field-help" id="ivd-help">{t(data.locale, 'field.ivdHint')}</p>
          {#if characterError('ivd_sequence')}<p class="field-error" id="ivd_sequence-error">{characterError('ivd_sequence')}</p>{/if}
        </div>
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
      {#if characterError('comparison')}<p class="field-error" id="comparison-error" role="alert">{characterError('comparison')}</p>{/if}
      <ComparisonGrid locale={data.locale} rows={comparisons} invalid={!!characterError('comparison')} describedBy={characterError('comparison') ? 'comparison-error' : undefined} />
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
            hint={t(data.locale, 'field.fileFormats')} pasteHint={t(data.locale, 'field.imagePaste')}
            hintId={`formats-${item.id}`}
            describedBy={`formats-${item.id} evidence-keep-${item.id}`}
            error={evidenceError(item, 'image') ?? ''}
          />
          <p class="field-help" id={`evidence-keep-${item.id}`}>{t(data.locale, 'evidence.keepImage')}</p>
        </div>
        <div class="field">
          <label class="field-label" for={`url-${item.id}`}>{t(data.locale, 'field.url')}</label>
          <input id={`url-${item.id}`} name="url" type="url" maxlength="1000" placeholder="https://" value={evidenceValue(item, 'url')} use:cleanLinkInput aria-invalid={!!evidenceError(item, 'url')} aria-describedby={`url-help-${item.id}`} />
          <p class="field-help" id={`url-help-${item.id}`}>{t(data.locale, 'field.urlHint')}</p>
          {#if evidenceError(item, 'url')}<p class="field-error">{evidenceError(item, 'url')}</p>{/if}
        </div>
        <div class="field">
          <label class="field-label" for={`place-${item.id}`}>{t(data.locale, 'field.place')}</label>
          <input id={`place-${item.id}`} name="place" maxlength="500" value={evidenceValue(item, 'place')} aria-invalid={!!evidenceError(item, 'place')} />
          {#if evidenceError(item, 'place')}<p class="field-error">{evidenceError(item, 'place')}</p>{/if}
        </div>
        <div class="field-grid">
          <div class="field"><label class="field-label" for={`provider-${item.id}`}>{t(data.locale, 'field.provider')}</label><input id={`provider-${item.id}`} name="provider" maxlength="300" value={evidenceValue(item, 'provider')} /></div>
          <div class="field"><label class="field-label" for={`provider-url-${item.id}`}>{t(data.locale, 'field.providerUrl')}</label><input id={`provider-url-${item.id}`} name="provider_url" type="url" maxlength="1000" placeholder="https://" value={evidenceValue(item, 'provider_url')} /></div>
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
          hint={t(data.locale, 'field.fileFormats')} pasteHint={t(data.locale, 'field.imagePaste')}
          hintId="new-formats"
          describedBy="new-formats"
          error={addError('image') ?? ''}
          sourceUrl={addUrl}
          fetchingLabel={t(data.locale, 'field.linkImageWorking')}
          fetchFailedLabel={t(data.locale, 'field.linkImageFailed')}
          onpost={fillAddFromPost}
        />
      </div>
      <div class="field">
        <label class="field-label" for="new-url">{t(data.locale, 'field.url')}</label>
        <input id="new-url" name="url" type="url" maxlength="1000" placeholder="https://" bind:value={addUrl} use:cleanLinkInput aria-invalid={!!addError('url')} aria-describedby="new-url-help" />
        <p class="field-help" id="new-url-help">{t(data.locale, 'field.urlHint')}</p>
        {#if addError('url')}<p class="field-error">{addError('url')}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="new-place">{t(data.locale, 'field.place')}</label>
        <input id="new-place" name="place" maxlength="500" bind:value={addPlace} aria-invalid={!!addError('place')} />
        {#if addError('place')}<p class="field-error">{addError('place')}</p>{/if}
      </div>
      <div class="field-grid">
        <div class="field"><label class="field-label" for="new-provider">{t(data.locale, 'field.provider')}</label><input id="new-provider" name="provider" maxlength="300" bind:value={addProvider} /></div>
        <div class="field"><label class="field-label" for="new-provider-url">{t(data.locale, 'field.providerUrl')}</label><input id="new-provider-url" name="provider_url" type="url" maxlength="1000" placeholder="https://" bind:value={addProviderUrl} /></div>
      </div>
      <div class="field-grid">
        <div class="field"><label class="field-label" for="new-title">{t(data.locale, 'field.title')}</label><input id="new-title" name="title" maxlength="300" bind:value={addTitle} /></div>
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
