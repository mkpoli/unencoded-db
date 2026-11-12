<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import IdsDrawing from '$lib/components/IdsDrawing.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import ClaimFields from '$lib/components/ClaimFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { compositionOf, valuesOf } from '$lib/claims'
  import { ADD_SIGHTINGS_MAX, MEDIA_MAX } from '$lib/limits'
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
  const detailed = $derived(Boolean(values && (values.radical || values.strokes != null || claims.some(claim => claim.kind !== 'ids' && claim.kind !== 'composition'))))
  const message = $derived(form?.error ? `${form.sighting ? `${t('add.sighting', { n: form.sighting })} · ` : ''}${t(`error.${form.error}`, { max: ADD_SIGHTINGS_MAX })}` : null)
</script>

<Seo title={t('add.title')} />
<div class="page narrow stack">
  <header class="heading"><h1>{t('add.title')}</h1><a class="text-link" href={href('/batch')}>{t('batch.link')}</a></header>
  {#if message}<p class="notice bad" role="alert">{message}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel character">
      <div class="plate"><IdsDrawing ids={primary} /></div>
      <div class="stack described">
        <IdsField values={descriptions} bind:primary onfill={facts => filled = facts} />
        <CompositionField ids={primary} value={composition} />
        <div class="line"><ScriptPicker value={values?.script} other={values?.script_other} /></div>
      </div>
    </section>
    <div class="field"><label class="title" for="description">{t('field.description')}</label><textarea class="input" id="description" name="description" rows="3">{values?.description ?? ''}</textarea></div>
    <section class="stack"><h2>{t('entry.sightings')}</h2>
      {#each sightings as item, index (item.key)}
        <fieldset class="panel stack sighting" bind:this={sections[item.key]} tabindex="-1" data-sighting>
          <legend>{t('add.sighting', { n: index + 1 })}</legend>
          {#if index > 0}<button type="button" class="text-button remove" aria-label={t('add.sightingRemove', { n: index + 1 })} onclick={() => remove(item.key)}>{t('form.remove')}</button>{/if}
          <input type="hidden" name={SIGHTING_START} />
          <PictureList bind:this={lists[item.key]} max={MEDIA_MAX} onready={working => preparing[item.key] = working} />
          <SightingFields values={item.seen} onphoto={file => lists[item.key]?.offer(file)} />
        </fieldset>
      {/each}
      {#if sightings.length < ADD_SIGHTINGS_MAX}<div><button type="button" class="text-button" onclick={add}>+ {t('entry.addSighting')}</button></div>{/if}
    </section>
    <details class="panel" open={detailed || Boolean(filled)}>
      <summary>{t('entry.addDetails')}</summary>
      <div class="stack details"><ClaimFields {claims} radical={values?.radical} strokes={values?.strokes} fill={filled} /></div>
    </details>
    <SubmitBar {busy} label={t('nav.add')} cancel={href()} sticky />
  </form>
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:6px 16px }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .character { display:grid; grid-template-columns:208px minmax(0, 1fr); align-items:start; gap:24px }
  .described { gap:14px }
  .line { padding-top:10px; border-top:1px dashed var(--line) }
  .title, summary { font-size:16px; font-weight:600 }
  legend { font-weight:600 }
  .sighting { position:relative; min-width:0; margin:0 }
  .sighting:focus-visible { outline-offset:4px }
  legend { padding:0 6px; margin-inline-start:-6px }
  /* On the border, across from the legend: the border runs through the middle of the legend's line. */
  .remove { position:absolute; inset-block-start:-.75em; inset-inline-end:14px; translate:0 -50%; min-height:0; padding:0 6px; background:var(--paper); line-height:1.5 }
  summary { cursor:pointer } .details { margin-top:18px }
  @media(max-width:700px) {
    .panel { padding:16px }
    .character { grid-template-columns:minmax(0, 1fr); gap:16px }
    .plate { width:148px; justify-self:center }
  }
</style>
