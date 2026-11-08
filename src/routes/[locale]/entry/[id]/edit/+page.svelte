<script lang="ts">
  import { localizedHref, t, type Locale } from '$lib/i18n'

  type FieldName = 'script' | 'ids' | 'description' | 'place' | 'title' | 'author' | 'publisher' | 'year' | 'page' | 'note'
  type Entry = { id: number; revision: number; edit_generation: number } & Record<FieldName, string | null>
  type FormState = {
    message?: string
    errors?: Partial<Record<FieldName, string>>
    values?: Record<FieldName, string>
    revision?: unknown
    generation?: unknown
  }
  type EditField = { name: FieldName; label: string; max: number; required?: boolean; multiline?: boolean }

  let { data, form }: { data: { locale: Locale; entry: Entry }; form?: FormState } = $props()

  const sourceFields: EditField[] = [
    { name: 'place', label: 'field.place', max: 500, required: true },
    { name: 'title', label: 'field.title', max: 300 },
    { name: 'author', label: 'field.author', max: 300 },
    { name: 'publisher', label: 'field.publisher', max: 300 }
  ]
  const numberFields: EditField[] = [
    { name: 'year', label: 'field.year', max: 40 },
    { name: 'page', label: 'field.page', max: 80 }
  ]
  const noteFields: EditField[] = [
    { name: 'note', label: 'field.note', max: 5000, multiline: true }
  ]
  const characterFields: EditField[] = [
    { name: 'script', label: 'field.script', max: 80, required: true },
    { name: 'ids', label: 'field.ids', max: 200 },
    { name: 'description', label: 'field.description', max: 5000, multiline: true }
  ]

  const order: FieldName[] = ['place', 'title', 'author', 'publisher', 'year', 'page', 'note', 'script', 'ids', 'description']
  const value = (name: FieldName) => form?.values?.[name] ?? data.entry[name] ?? ''

  // Move focus to what blocked the write: the first invalid field, or the notice.
  $effect(() => {
    if (!form) return
    const first = order.find(name => form?.errors?.[name])
    const target = first ?? (form.message ? 'form-error' : undefined)
    if (target) requestAnimationFrame(() => document.getElementById(target)?.focus())
  })
</script>

{#snippet control(field: EditField)}
  <div class="field">
    <label class="field-label" for={field.name}>{t(data.locale, field.label)}</label>
    {#if field.multiline}
      <textarea id={field.name} name={field.name} maxlength={field.max} aria-invalid={!!form?.errors?.[field.name]} aria-describedby={form?.errors?.[field.name] ? `${field.name}-error` : undefined}>{value(field.name)}</textarea>
    {:else}
      <input id={field.name} name={field.name} maxlength={field.max} required={field.required === true} value={value(field.name)} aria-invalid={!!form?.errors?.[field.name]} aria-describedby={form?.errors?.[field.name] ? `${field.name}-error` : undefined} />
    {/if}
    {#if form?.errors?.[field.name]}<p class="field-error" id={`${field.name}-error`}>{form.errors[field.name]}</p>{/if}
  </div>
{/snippet}

<svelte:head><title>{t(data.locale, 'entry.revise')} · {t(data.locale, 'app.name')}</title></svelte:head>
<div class="form-page">
  <a class="back-link" href={localizedHref(data.locale, `/entry/${data.entry.id}`)}>← {t(data.locale, 'entry.record', { id: data.entry.id })}</a>
  <div class="page-heading">
    <h1>{t(data.locale, 'entry.revise')}</h1>
    <p>{t(data.locale, 'edit.intro')}</p>
  </div>
  {#if form?.message}
    <p class="notice error" id="form-error" tabindex="-1" role="alert">{form.message}</p>
  {/if}
  <form class="form-panel" method="POST" novalidate>
    <input type="hidden" name="revision" value={form ? String(form.revision ?? '') : data.entry.revision} />
    <input type="hidden" name="edit_generation" value={form ? String(form.generation ?? '') : data.entry.edit_generation} />
    <section class="form-section" aria-labelledby="source-heading">
      <h2 class="section-label" id="source-heading">{t(data.locale, 'field.source')}</h2>
      {#each sourceFields as field}{@render control(field)}{/each}
      <div class="field-grid">{#each numberFields as field}{@render control(field)}{/each}</div>
      {#each noteFields as field}{@render control(field)}{/each}
    </section>
    <section class="form-section" aria-labelledby="character-heading">
      <h2 class="section-label" id="character-heading">{t(data.locale, 'form.character')}</h2>
      {#each characterFields as field}{@render control(field)}{/each}
    </section>
    <div class="form-actions">
      <button class="primary" type="submit">{t(data.locale, 'edit.save')} <span aria-hidden="true">→</span></button>
    </div>
  </form>
</div>
