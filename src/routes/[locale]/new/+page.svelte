<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import IdsDrawing from '$lib/components/IdsDrawing.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import IdentityFields from '$lib/components/IdentityFields.svelte'
  import TextClaims from '$lib/components/TextClaims.svelte'
  import RelatedCharacters from '$lib/components/RelatedCharacters.svelte'
  import CategoryFields from '$lib/components/CategoryFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { claimsOf, compositionOf, relationsOf, valuesOf } from '$lib/claims'
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
  let primary = $state(descriptions[0] ?? '')
  const composition = $derived.by(() => { const found = compositionOf(claims); return found ? JSON.stringify(found) : '' })

  // A form heavier than the server takes is stopped here, where what was typed is still on the page.
  let heavy = $state(false)
  let notice = $state<HTMLElement>()
  async function weigh(event: SubmitEvent) {
    const files = [...(event.currentTarget as HTMLFormElement).querySelectorAll<HTMLInputElement>('input[type=file]')].flatMap(input => [...(input.files ?? [])])
    heavy = files.reduce((sum, file) => sum + file.size, 0) > PICTURES_BODY_MAX - 1024 * 1024
    if (!heavy) return
    event.preventDefault()
    await tick()
    notice?.scrollIntoView({ block: 'center' })
  }
  const message = $derived(heavy ? t('error.tooLarge') : form?.error ? `${form.sighting ? `${t('add.sighting', { n: form.sighting })} · ` : ''}${t(`error.${form.error}`, { max: ADD_SIGHTINGS_MAX })}` : null)
</script>

<Seo title={t('add.title')} />
<div class="page narrow stack">
  <header class="heading"><h1>{t('add.title')}</h1><a class="text-link" href={href('/batch')}>{t('batch.link')}</a></header>
  {#if message}<p class="notice bad" role="alert" bind:this={notice}>{message}</p>{/if}
  <form class="form" method="POST" enctype="multipart/form-data" onsubmit={weigh}>
    <section class="panel character">
      <div class="plate"><IdsDrawing ids={primary} /></div>
      <div class="described">
        <IdsField values={descriptions} bind:primary onfill={facts => filled = facts} />
        <div class="sheet">
          <CompositionField ids={primary} value={composition} />
          <ScriptPicker value={values?.script} other={values?.script_other} />
          <IdentityFields {claims} radical={values?.radical} strokes={values?.strokes} fill={filled} />
        </div>
      </div>
    </section>
    <section class="panel group">
      <div class="titled"><label class="section-title" for="description">{t('field.description')}</label><textarea class="input" id="description" name="description" rows="3">{values?.description ?? ''}</textarea></div>
      <div class="said">
        <TextClaims kind="reading" values={claimsOf(claims, 'reading')} fill={filled?.readings} />
        <TextClaims kind="meaning" values={claimsOf(claims, 'meaning')} fill={filled?.meaning ? [{ value: filled.meaning }] : []} />
      </div>
    </section>
    <section class="panel"><RelatedCharacters values={relationsOf(claims)} fill={filled?.variants} /></section>
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
      <div class="group filed"><CategoryFields genres={valuesOf(claims, 'genre')} collections={valuesOf(claims, 'collection')} tags={valuesOf(claims, 'tag')} /></div>
    </details>
    <SubmitBar {busy} label={t('nav.add')} cancel={href()} sticky />
  </form>
</div>
<style>
  /* Three steps of space: a label and its control, the fields of a group, one group and the next. */
  .form { display:flex; flex-direction:column; gap:28px; min-width:0 }
  .group, .sighting, .described { display:flex; flex-direction:column; gap:16px; min-width:0 }
  .heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px 16px }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .character { display:grid; grid-template-columns:208px minmax(0, 1fr); align-items:start; gap:24px }
  .sheet { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px dashed var(--line) }
  .titled { display:flex; flex-direction:column; gap:8px; min-width:0 }
  /* The drawing stays in view while the facts beside it are filled in. */
  .plate { position:sticky; inset-block-start:16px }
  .said { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); align-items:start; gap:16px }
  .sighting { position:relative; margin:0 }
  .sighting:focus-visible { outline-offset:4px }
  legend { padding:0 6px; margin-inline-start:-6px; font-weight:600 }
  /* On the border, across from the legend: the border runs through the middle of the legend's line. */
  .remove { position:absolute; inset-block-start:-.75em; inset-inline-end:14px; translate:0 -50%; min-height:0; padding:0 6px; background:var(--paper); line-height:1.5 }
  .filing summary { cursor:pointer }
  .filed { margin-top:14px }
  @media(max-width:700px) {
    .panel { padding:16px }
    .character { grid-template-columns:minmax(0, 1fr); gap:16px }
    .plate { position:static; width:148px; justify-self:center }
    .said { grid-template-columns:minmax(0, 1fr) }
  }
</style>
