<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import CharacterFields from '$lib/components/CharacterFields.svelte'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import IdentityFields from '$lib/components/IdentityFields.svelte'
  import SenseFields from '$lib/components/SenseFields.svelte'
  import RelationFields from '$lib/components/RelationFields.svelte'
  import { createSenseDraft } from '$lib/sense-draft.svelte'
  import TagFields from '$lib/components/TagFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { compositionOf, primaryLayoutOf, valuesOf } from '$lib/claims'
  import { ADD_SIGHTINGS_MAX, MEDIA_MAX, PICTURES_BODY_MAX } from '$lib/limits'
  import { SIGHTING_START } from '$lib/scripts'
  import { href, media, t } from '$lib/t'
  import type { CharacterFacts } from '$lib/encoded'
  import type { SightingFields as SightingValues } from '$lib/server/entries'
  import { onMount, tick, untrack } from 'svelte'
  let { form, data } = $props()
  let filled = $state<CharacterFacts | null>(null)
  const values = $derived(form?.values)

  // The sightings of the form, the first of which stays. A rejected form brings back what was typed in
  // each; pictures are chosen again.
  let next = 0
  const sighting = (seen: Partial<SightingValues> = {}) => ({ key: next++, seen })
  const typed = untrack(() => form?.values.sightings ?? [])
  let sightings = $state(typed.length ? typed.map(sighting) : [sighting(untrack(() => form ? {} : data.seed?.values ?? {}))])
  const lists: Record<number, PictureList | null> = {}
  const sections: Record<number, HTMLElement | null> = {}
  let preparing = $state<Record<number, boolean>>({})
  const busy = $derived(sightings.some(item => preparing[item.key]))
  // A claim names a sighting of this form by its place on the page, which changes when one is removed.
  const evidence = $derived(sightings.map((item, index) => ({ token: String(item.key), value: String(index + 1), label: t('add.sighting', { n: index + 1 }) })))

  async function add() {
    const added = sighting()
    sightings.push(added)
    await tick()
    sections[added.key]?.focus()
  }
  async function remove(key: number) {
    const at = sightings.findIndex(item => item.key === key)
    sightings.splice(at, 1)
    await tick()
    sections[sightings[Math.max(0, at - 1)].key]?.focus()
  }

  // The pictures of the sighting the form starts from, fetched so that a new box can be drawn on each.
  onMount(async () => {
    if (form) return
    for (const key of data.seed?.pictures ?? []) {
      const response = await fetch(media(key)).catch(() => null)
      if (response?.ok) await lists[sightings[0].key]?.add(await response.blob())
    }
  })
  const claims = $derived(values?.claims ?? [])
  const descriptions = untrack(() => valuesOf(form?.values.claims ?? [], 'ids'))
  const layout = untrack(() => primaryLayoutOf(form?.values.claims ?? []))
  let primary = $state(descriptions[0] ?? '')
  const composition = $derived.by(() => { const found = compositionOf(claims); return found ? JSON.stringify(found) : '' })
  const senses = createSenseDraft({ claims: untrack(() => claims), evidence: untrack(() => evidence) })
  onMount(() => senses.start())
  $effect(() => {
    if (filled) senses.applyFill(filled)
  })

  // A form heavier than the server takes is stopped here, where what was typed is still on the page.
  let heavy = $state(false)
  let notice = $state<HTMLElement>()
  let formEl = $state<HTMLFormElement>()
  async function weigh(event: SubmitEvent) {
    invalidRevealed = false
    const files = [...(event.currentTarget as HTMLFormElement).querySelectorAll<HTMLInputElement>('input[type=file]')].flatMap(input => [...(input.files ?? [])])
    heavy = files.reduce((sum, file) => sum + file.size, 0) > PICTURES_BODY_MAX - 1024 * 1024
    if (!heavy) return
    event.preventDefault()
    await tick()
    notice?.scrollIntoView({ block: 'center' })
  }
  const message = $derived(heavy ? t('error.tooLarge') : form?.error ? `${form.sighting ? `${t('add.sighting', { n: form.sighting })} · ` : ''}${t(`error.${form.error}`, { max: ADD_SIGHTINGS_MAX })}` : null)

  // A field the browser rejects, or one the server names, is marked and brought into view. The server
  // error arrives with the rejected form, so the page opens the line and section that holds the field.
  let invalidRevealed = false
  const FIELD_SELECTORS: Record<string, string[]> = {
    ids: ['.descriptions input:not([type="hidden"])'],
    readings: ['input[name="reading_doculect"]', 'input[name="reading"]', 'textarea[name="meaning"]'],
    encodings: ['input[name="encoding_charset"]', 'input[name="encoding_code"]', 'select[name="encoding_charset"]'],
    relatedCharacters: ['input[name="related_character"][required]'],
    ivd: ['input[name="ivd_sequence"]', 'select[name="ivd_status"]'],
    tags: ['input[name="tags"]'],
    tag: ['input[name="tag_new"]', 'input[name="tags"]'],
  }

  function errorField(error: string, sighting: number): { target: HTMLElement; marks: HTMLElement[] } | null {
    const scope = sighting ? formEl?.querySelectorAll<HTMLElement>('[data-sighting]')[sighting - 1] ?? null : formEl
    const inSighting = (selector: string) => scope?.querySelector<HTMLElement>(selector) ?? null
    if (error === 'place') {
      const place = inSighting('input[name="place"]')
      return place ? { target: place, marks: [place] } : null
    }
    if (error === 'evidence') {
      const url = inSighting('input[name="url"]'), pictures = inSighting('[data-pictures]')
      const target = url ?? pictures
      return target ? { target, marks: [url, pictures].filter((item): item is HTMLElement => Boolean(item)) } : null
    }
    if (error === 'image') {
      const pictures = inSighting('[data-pictures]')
      if (!pictures) return null
      const files = [...pictures.querySelectorAll<HTMLInputElement>('input[type="file"]')]
      return { target: files[0] ?? pictures, marks: [pictures, ...files] }
    }
    if (error === 'ivd' && formEl) {
      const sequence = formEl.querySelector<HTMLElement>('input[name="ivd_sequence"]')
      const status = formEl.querySelector<HTMLElement>('select[name="ivd_status"]')
      if (sequence) return { target: sequence, marks: [sequence, status].filter((item): item is HTMLElement => Boolean(item)) }
    }
    if (error === 'ids' && formEl) {
      const descriptions = formEl.querySelector<HTMLElement>('.descriptions')
      const field = descriptions?.querySelector<HTMLElement>('input:not([type="hidden"])')
      if (descriptions && field) return { target: field, marks: [descriptions] }
    }
    const selectors = FIELD_SELECTORS[error]
    if (!formEl || !selectors) return null
    for (const selector of selectors) {
      const marks = [...formEl.querySelectorAll<HTMLElement>(selector)]
      if (marks.length) return { target: marks[0], marks }
    }
    return null
  }

  async function reveal(target: HTMLElement) {
    for (let node: Element | null = target; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) node.open = true
    }
    await tick()
    target.scrollIntoView({ block: 'center' })
    if (target.matches('[data-pictures]')) {
      target.querySelector<HTMLInputElement>('input[type="file"]')?.focus({ preventScroll: true })
      return
    }
    const control = target.matches('input:not([type=hidden]), select, textarea')
      ? target
      : target.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')
    control?.focus({ preventScroll: true })
  }

  function invalid(event: Event) {
    const control = event.target
    if (!(control instanceof HTMLElement)) return
    control.setAttribute('aria-invalid', 'true')
    control.closest('[data-pictures]')?.setAttribute('aria-invalid', 'true')
    if (invalidRevealed) return
    invalidRevealed = true
    void reveal(control)
  }

  function clearInvalid(event: Event) {
    const control = event.target
    if (!(control instanceof HTMLElement)) return
    if (control.closest('.descriptions')) formEl?.querySelector('.descriptions')?.removeAttribute('aria-invalid')
    else control.removeAttribute('aria-invalid')
    control.closest('[data-pictures]')?.removeAttribute('aria-invalid')
    // The choice and its sequence are one answer, and so are a code and its set.
    if (control.matches('[name="ivd_status"], [name="ivd_sequence"]')) formEl?.querySelectorAll('[name="ivd_status"], [name="ivd_sequence"]').forEach(item => item.removeAttribute('aria-invalid'))
    if (control.matches('[name="encoding_charset"], [name="encoding_code"]')) formEl?.querySelectorAll('[name="encoding_charset"], [name="encoding_code"]').forEach(item => item.removeAttribute('aria-invalid'))
    // A link or a picture answers the evidence rule for the whole sighting.
    const section = control.closest('[data-sighting]')
    if (section) {
      const url = section.querySelector<HTMLInputElement>('input[name="url"]')
      const via = [...section.querySelectorAll<HTMLInputElement>('input[name="via_url"]')].some(input => input.value.trim())
      const image = section.querySelector<HTMLInputElement>('input[name="image"]')
      if (url?.value.trim() || via || image?.files?.length) {
        url?.removeAttribute('aria-invalid')
        section.querySelector('[data-pictures]')?.removeAttribute('aria-invalid')
      }
    }
    invalidRevealed = false
  }

  async function showError(error: string, sighting: number) {
    await tick()
    const found = errorField(error, sighting)
    for (const mark of found?.marks ?? []) mark.setAttribute('aria-invalid', 'true')
    if (found) await reveal(found.target)
    else notice?.focus()
  }

  // A rejected form comes back with the error it named; open the field it belongs to once.
  let reported = ''
  $effect(() => {
    const root = formEl, error = form?.error
    if (!root) return
    if (!error) { reported = ''; return }
    const key = `${error}:${form.sighting ?? 0}`
    if (reported === key) return
    reported = key
    void showError(error, form.sighting ?? 0)
  })
</script>

<Seo title={t('add.title')} />
<div class="page narrow stack">
  <header class="heading"><h1>{t('add.title')}</h1><a class="text-link" href={href('/batch')}>{t('batch.link')}</a></header>
  {#if message}<p class="notice bad" role="alert" tabindex="-1" bind:this={notice}>{message}</p>{/if}
  <form class="form" method="POST" enctype="multipart/form-data" bind:this={formEl} onsubmit={weigh} oninvalidcapture={invalid} oninput={clearInvalid} onchange={clearInvalid}>
    <section class="panel character">
      <CharacterFields values={descriptions} {layout} bind:primary onfill={facts => filled = facts}>
        <div class="sheet">
          <CompositionField ids={primary} value={composition} />
          <ScriptPicker value={values?.script} other={values?.script_other} />
          <IdentityFields {claims} radical={values?.radical} strokes={values?.strokes} fill={filled} ids={primary} />
        </div>
      </CharacterFields>
      <div class="related"><RelationFields senses={senses} {evidence} /></div>
    </section>
    <section class="panel"><SenseFields {evidence} {senses} /></section>
    <section class="group"><h2>{t('entry.sightings')}</h2>
      {#each sightings as item, index (item.key)}
        <fieldset class="panel sighting" bind:this={sections[item.key]} tabindex="-1" data-sighting>
          <legend>{t('add.sighting', { n: index + 1 })}</legend>
          {#if index > 0}<button type="button" class="text-button remove" aria-label={t('add.sightingRemove', { n: index + 1 })} onclick={() => remove(item.key)}>{t('form.remove')}</button>{/if}
          <input type="hidden" name={SIGHTING_START} />
          <PictureList bind:this={lists[item.key]} max={MEDIA_MAX} onready={working => preparing[item.key] = working} />
          <SightingFields values={item.seen} onphotos={files => lists[item.key]?.offer(files)} />
        </fieldset>
      {/each}
      {#if sightings.length < ADD_SIGHTINGS_MAX}<div><button type="button" class="text-button" onclick={add}>+ {t('entry.addSighting')}</button></div>{/if}
    </section>
    <details class="panel filing" open>
      <summary class="section-title">{t('field.filing')}</summary>
      <div class="group filed"><TagFields tags={data.tags} selected={valuesOf(claims, 'tag')} collections={valuesOf(claims, 'collection')} /></div>
    </details>
    <section class="panel noted">
      <div class="titled"><label class="section-title" for="description">{t('field.notes')}</label><span class="subtitle" id="description-note">{t('field.description')}</span></div>
      <textarea class="input" id="description" name="description" rows="3" aria-describedby="description-note">{values?.description ?? ''}</textarea>
    </section>
    <SubmitBar {busy} label={t('nav.add')} cancel={href()} sticky />
  </form>
</div>
<style>
  /* Three steps of space: a label and its control, the fields of a group, one group and the next. */
  .form { display:flex; flex-direction:column; gap:28px; min-width:0 }
  .group, .sighting { display:flex; flex-direction:column; gap:16px; min-width:0 }
  .heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px 16px }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .character { display:flex; flex-direction:column; gap:20px }
  .sheet { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px dashed var(--line) }
  .related { padding-top:18px; border-top:1px dashed var(--line) }
  .titled { display:flex; flex-direction:column; gap:8px; min-width:0 }
  .noted { display:flex; flex-direction:column; gap:8px }
  .noted .subtitle { margin-top:-4px; color:var(--muted); font-size:13px }
  .sighting { position:relative; margin:0 }
  .sighting:focus-visible { outline-offset:4px }
  legend { padding:0 6px; margin-inline-start:-6px; font-weight:600 }
  /* On the border, across from the legend: the border runs through the middle of the legend's line. */
  .remove { position:absolute; inset-block-start:-.75em; inset-inline-end:14px; translate:0 -50%; min-height:0; padding:0 6px; background:var(--paper); line-height:1.5 }
  .filing summary { cursor:pointer }
  .filed { margin-top:14px }
  @media(max-width:700px) {
    .panel { padding:16px }
  }
</style>
