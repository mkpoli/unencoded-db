<script lang="ts">
  import FileField from '$lib/components/FileField.svelte'
  import ScriptSelect from '$lib/components/ScriptSelect.svelte'
  import { DEFAULT_SCRIPT } from '$lib/script'
  import { t, type Locale } from '$lib/i18n'
  type Row = { script: string; ids: string; description: string }
  let { data }: { data: { locale: Locale } } = $props()
  let rows = $state<Row[]>([{ script: DEFAULT_SCRIPT, ids: '', description: '' }])
  const add = () => rows.push({ script: DEFAULT_SCRIPT, ids: '', description: '' })
  const remove = (index: number) => { if (rows.length > 1) rows.splice(index, 1) }
</script>

<svelte:head><title>{t(data.locale, 'batch.title')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="form-page">
  <div class="page-heading"><h1>{t(data.locale, 'batch.title')}</h1><p>{t(data.locale, 'batch.intro')}</p></div>
  <form class="form-panel" method="POST" enctype="multipart/form-data">
    <section class="form-section">
      <h2 class="section-label">{t(data.locale, 'batch.source')}</h2>
      <div class="field">
        <label class="field-label" for="image">{t(data.locale, 'field.sourceImage')}</label>
        <FileField id="image" name="image" label={t(data.locale, 'field.sourceImage')} choose={t(data.locale, 'field.chooseImage')} browse={t(data.locale, 'field.browseImage')} replace={t(data.locale, 'field.replaceImage')} remove={t(data.locale, 'field.removeImage')} previewAlt={t(data.locale, 'field.imagePreview')} hint={t(data.locale, 'field.fileFormats')} pasteHint={t(data.locale, 'field.imagePaste')} describedBy="file-formats" />
      </div>
      <div class="field"><label class="field-label" for="place">{t(data.locale, 'field.place')}</label><input id="place" name="place" required maxlength="500" /></div>
      <details class="details"><summary>{t(data.locale, 'field.moreDetails')}</summary><div class="details-body">
        <div class="grid-2">
          <div class="field"><label class="field-label" for="title">{t(data.locale, 'field.title')}</label><input id="title" name="title" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="author">{t(data.locale, 'field.author')}</label><input id="author" name="author" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="publisher">{t(data.locale, 'field.publisher')}</label><input id="publisher" name="publisher" maxlength="300" /></div>
          <div class="field"><label class="field-label" for="year">{t(data.locale, 'field.year')}</label><input id="year" name="year" maxlength="40" placeholder="1998 / 1998-05 / 1998-05-12 / 05" /></div>
          <div class="field"><label class="field-label" for="page">{t(data.locale, 'field.page')}</label><input id="page" name="page" maxlength="80" /></div>
        </div>
      </div></details>
    </section>
    <section class="form-section">
      <h2 class="section-label">{t(data.locale, 'batch.characters')}</h2>
      {#each rows as row, i}
        <fieldset class="comparison">
          <legend>{t(data.locale, 'batch.character', { n: i + 1 })}</legend>
          <div class="field"><label class="field-label" for={`script-${i}`}>{t(data.locale, 'field.script')}</label><ScriptSelect id={`script-${i}`} bind:value={row.script} /></div>
          <div class="field"><label class="field-label" for={`ids-${i}`}>{t(data.locale, 'field.ids')}</label><input id={`ids-${i}`} name="ids" maxlength="200" bind:value={row.ids} /></div>
          <div class="field"><label class="field-label" for={`description-${i}`}>{t(data.locale, 'field.description')}</label><textarea id={`description-${i}`} name="description" maxlength="5000" bind:value={row.description}></textarea></div>
          {#if rows.length > 1}<button class="secondary" type="button" onclick={() => remove(i)}>{t(data.locale, 'batch.remove')}</button>{/if}
        </fieldset>
      {/each}
      <button class="secondary" type="button" onclick={add}>{t(data.locale, 'batch.add')}</button>
    </section>
    <button class="primary" type="submit">{t(data.locale, 'batch.save')}</button>
  </form>
</div>
