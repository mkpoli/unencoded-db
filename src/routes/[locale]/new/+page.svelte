<script lang="ts">
  import { t, type Locale } from '$lib/i18n'

  type Values = Record<string, string>
  let { form, data }: { form?: { errors?: Record<string, string>; values?: Values }; data: { locale: Locale } } = $props()
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
  <form method="POST" enctype="multipart/form-data" novalidate>
    <section class="panel" aria-labelledby="source-heading">
      <h2 id="source-heading">{t(data.locale, 'field.source')}</h2>
      <div class="field">
        <label>{t(data.locale, 'field.sourceImage')} <input name="image" type="file" accept="image/jpeg,image/png,image/webp" required aria-invalid={!!form?.errors?.image} aria-describedby={form?.errors?.image ? 'image-help image-rights image-error' : 'image-help image-rights'} /></label>
        <p class="field-help" id="image-help">{t(data.locale, 'field.sourceImageHint')}</p>
        <p class="field-help" id="image-rights">{t(data.locale, 'field.rightsHint')}</p>
        {#if form?.errors?.image}<p class="field-error" id="image-error">{form.errors.image}</p>{/if}
      </div>
      <div class="field">
        <label>{t(data.locale, 'field.place')} <input name="place" required maxlength="500" value={form?.values?.place ?? ''} aria-invalid={!!form?.errors?.place} aria-describedby={form?.errors?.place ? 'place-error' : undefined} /></label>
        {#if form?.errors?.place}<p class="field-error" id="place-error">{form.errors.place}</p>{/if}
      </div>
      <details open={!!(form?.errors?.title || form?.errors?.author || form?.errors?.publisher || form?.errors?.year || form?.errors?.page)}>
        <summary>{t(data.locale, 'form.bibliographic')} <span>{t(data.locale, 'form.optional')}</span></summary>
        <div class="details-fields">
          <div class="field"><label>{t(data.locale, 'field.title')} <input name="title" maxlength="300" value={form?.values?.title ?? ''} aria-invalid={!!form?.errors?.title} aria-describedby={form?.errors?.title ? 'title-error' : undefined} /></label>{#if form?.errors?.title}<p class="field-error" id="title-error">{form.errors.title}</p>{/if}</div>
          <div class="field"><label>{t(data.locale, 'field.author')} <input name="author" maxlength="300" value={form?.values?.author ?? ''} aria-invalid={!!form?.errors?.author} aria-describedby={form?.errors?.author ? 'author-error' : undefined} /></label>{#if form?.errors?.author}<p class="field-error" id="author-error">{form.errors.author}</p>{/if}</div>
          <div class="field"><label>{t(data.locale, 'field.publisher')} <input name="publisher" maxlength="300" value={form?.values?.publisher ?? ''} aria-invalid={!!form?.errors?.publisher} aria-describedby={form?.errors?.publisher ? 'publisher-error' : undefined} /></label>{#if form?.errors?.publisher}<p class="field-error" id="publisher-error">{form.errors.publisher}</p>{/if}</div>
          <div class="field-grid">
            <div class="field"><label>{t(data.locale, 'field.year')} <input name="year" maxlength="40" value={form?.values?.year ?? ''} aria-invalid={!!form?.errors?.year} aria-describedby={form?.errors?.year ? 'year-error' : undefined} /></label>{#if form?.errors?.year}<p class="field-error" id="year-error">{form.errors.year}</p>{/if}</div>
            <div class="field"><label>{t(data.locale, 'field.page')} <input name="page" maxlength="80" value={form?.values?.page ?? ''} aria-invalid={!!form?.errors?.page} aria-describedby={form?.errors?.page ? 'page-error' : undefined} /></label>{#if form?.errors?.page}<p class="field-error" id="page-error">{form.errors.page}</p>{/if}</div>
          </div>
        </div>
      </details>
      <div class="field"><label>{t(data.locale, 'field.note')} <textarea name="note" maxlength="5000" aria-invalid={!!form?.errors?.note} aria-describedby={form?.errors?.note ? 'note-error' : undefined}>{form?.values?.note ?? ''}</textarea></label>{#if form?.errors?.note}<p class="field-error" id="note-error">{form.errors.note}</p>{/if}</div>
    </section>
    <section class="panel" aria-labelledby="character-heading">
      <h2 id="character-heading">{t(data.locale, 'form.character')}</h2>
      <div class="field"><label>{t(data.locale, 'field.script')} <input name="script" required maxlength="80" value={form?.values?.script ?? 'Han'} aria-invalid={!!form?.errors?.script} aria-describedby={form?.errors?.script ? 'script-error' : undefined} /></label>{#if form?.errors?.script}<p class="field-error" id="script-error">{form.errors.script}</p>{/if}</div>
      <div class="field"><label>{t(data.locale, 'field.ids')} <input name="ids" maxlength="200" value={form?.values?.ids ?? ''} aria-invalid={!!form?.errors?.ids} aria-describedby={form?.errors?.ids ? 'ids-error' : undefined} /></label>{#if form?.errors?.ids}<p class="field-error" id="ids-error">{form.errors.ids}</p>{/if}</div>
      <div class="field"><label>{t(data.locale, 'field.description')} <textarea name="description" maxlength="5000" aria-invalid={!!form?.errors?.description} aria-describedby={form?.errors?.description ? 'description-error' : undefined}>{form?.values?.description ?? ''}</textarea></label>{#if form?.errors?.description}<p class="field-error" id="description-error">{form.errors.description}</p>{/if}</div>
    </section>
    <button type="submit">{t(data.locale, 'form.save')}</button>
  </form>
</div>
