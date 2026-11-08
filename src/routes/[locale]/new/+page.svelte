<script lang="ts">
  import FileField from '$lib/components/FileField.svelte'
  import { t, type Locale } from '$lib/i18n'

  type Values = Record<string, string>
  let { form, data }: { form?: { errors?: Record<string, string>; values?: Values }; data: { locale: Locale } } = $props()
  const imageError = $derived(form?.errors?.image ?? '')
</script>

<svelte:head><title>{t(data.locale, 'add.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="form-page">
  <div class="page-heading">
    <h1>{t(data.locale, 'add.title')}</h1>
    <p>{t(data.locale, 'add.intro')}</p>
  </div>
  {#if form?.errors?.form}
    <p class="notice error" role="alert">{form.errors.form}</p>
  {:else if form?.errors}
    <p class="notice error" role="alert">{t(data.locale, 'error.fields')}</p>
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
          describedBy={imageError ? 'image-help image-rights image-error' : 'image-help image-rights'}
          error={imageError}
        />
        <p class="field-help" id="image-help">{t(data.locale, 'field.sourceImageHint')}</p>
        <p class="field-help" id="image-rights">{t(data.locale, 'field.rightsHint')}</p>
        {#if imageError}<p class="field-error" id="image-error" role="alert">{imageError}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="place">{t(data.locale, 'field.place')}</label>
        <input id="place" name="place" required maxlength="500" value={form?.values?.place ?? ''} aria-invalid={!!form?.errors?.place} aria-describedby={form?.errors?.place ? 'place-error' : undefined} />
        {#if form?.errors?.place}<p class="field-error" id="place-error" role="alert">{form.errors.place}</p>{/if}
      </div>
      <details class="details" open={!!(form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page)}>
        <summary>{t(data.locale, 'form.bibliographic')} <span>{t(data.locale, 'form.optional')}</span></summary>
        <div class="details-body">
          <div class="field">
            <label class="field-label" for="title">{t(data.locale, 'field.title')}</label>
            <input id="title" name="title" maxlength="300" value={form?.values?.title ?? ''} aria-invalid={!!form?.errors?.title} aria-describedby={form?.errors?.title ? 'title-error' : undefined} />
            {#if form?.errors?.title}<p class="field-error" id="title-error" role="alert">{form.errors.title}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="author">{t(data.locale, 'field.author')}</label>
            <input id="author" name="author" maxlength="300" value={form?.values?.author ?? ''} aria-invalid={!!form?.errors?.author} aria-describedby={form?.errors?.author ? 'author-error' : undefined} />
            {#if form?.errors?.author}<p class="field-error" id="author-error" role="alert">{form.errors.author}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="publisher">{t(data.locale, 'field.publisher')}</label>
            <input id="publisher" name="publisher" maxlength="300" value={form?.values?.publisher ?? ''} aria-invalid={!!form?.errors?.publisher} aria-describedby={form?.errors?.publisher ? 'publisher-error' : undefined} />
            {#if form?.errors?.publisher}<p class="field-error" id="publisher-error" role="alert">{form.errors.publisher}</p>{/if}
          </div>
          <div class="field-grid">
            <div class="field">
              <label class="field-label" for="year">{t(data.locale, 'field.year')}</label>
              <input id="year" name="year" maxlength="40" value={form?.values?.year ?? ''} aria-invalid={!!form?.errors?.year} aria-describedby={form?.errors?.year ? 'year-error' : undefined} />
              {#if form?.errors?.year}<p class="field-error" id="year-error" role="alert">{form.errors.year}</p>{/if}
            </div>
            <div class="field">
              <label class="field-label" for="page">{t(data.locale, 'field.page')}</label>
              <input id="page" name="page" maxlength="80" value={form?.values?.page ?? ''} aria-invalid={!!form?.errors?.page} aria-describedby={form?.errors?.page ? 'page-error' : undefined} />
              {#if form?.errors?.page}<p class="field-error" id="page-error" role="alert">{form.errors.page}</p>{/if}
            </div>
          </div>
        </div>
      </details>
      <div class="field">
        <label class="field-label" for="note">{t(data.locale, 'field.note')}</label>
        <textarea id="note" name="note" maxlength="5000" aria-invalid={!!form?.errors?.note} aria-describedby={form?.errors?.note ? 'note-error' : undefined}>{form?.values?.note ?? ''}</textarea>
        {#if form?.errors?.note}<p class="field-error" id="note-error" role="alert">{form.errors.note}</p>{/if}
      </div>
    </section>
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field">
        <label class="field-label" for="script">{t(data.locale, 'field.script')}</label>
        <input id="script" name="script" required maxlength="80" value={form?.values?.script ?? 'Han'} aria-invalid={!!form?.errors?.script} aria-describedby={form?.errors?.script ? 'script-error' : undefined} />
        {#if form?.errors?.script}<p class="field-error" id="script-error" role="alert">{form.errors.script}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="ids">{t(data.locale, 'field.ids')}</label>
        <input id="ids" name="ids" maxlength="200" value={form?.values?.ids ?? ''} aria-invalid={!!form?.errors?.ids} aria-describedby={form?.errors?.ids ? 'ids-error' : undefined} />
        {#if form?.errors?.ids}<p class="field-error" id="ids-error" role="alert">{form.errors.ids}</p>{/if}
      </div>
      <div class="field">
        <label class="field-label" for="description">{t(data.locale, 'field.description')}</label>
        <textarea id="description" name="description" maxlength="5000" aria-invalid={!!form?.errors?.description} aria-describedby={form?.errors?.description ? 'description-error' : undefined}>{form?.values?.description ?? ''}</textarea>
        {#if form?.errors?.description}<p class="field-error" id="description-error" role="alert">{form.errors.description}</p>{/if}
      </div>
    </section>
    <div class="form-actions">
      <button class="primary" type="submit">{t(data.locale, 'form.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>
</div>
