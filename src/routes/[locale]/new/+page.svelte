<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import ClaimFields from '$lib/components/ClaimFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { compositionOf, valuesOf } from '$lib/claims'
  import { MEDIA_MAX } from '$lib/limits'
  import { href, t } from '$lib/t'
  let { form } = $props()
  let busy = $state(false)
  let pictures = $state<PictureList>()
  const values = $derived(form?.values)
  const claims = $derived(values?.claims ?? [])
  let ids = $derived(valuesOf(claims, 'ids').join(', '))
  const composition = $derived.by(() => { const found = compositionOf(claims); return found ? JSON.stringify(found) : '' })
  const detailed = $derived(Boolean(values && (values.radical || values.strokes != null || claims.some(claim => claim.kind !== 'ids' && claim.kind !== 'composition'))))
</script>

<Seo title={t('add.title')} />
<div class="page narrow stack">
  <div class="stack heading"><h1>{t('add.title')}</h1><p class="muted">{t('add.intro')}</p></div>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel stack">
      <ScriptPicker value={values?.script} other={values?.script_other} />
      <IdsField bind:value={ids} />
      <CompositionField {ids} value={composition} />
      <div class="field"><label for="description">{t('field.description')}</label><textarea class="input" id="description" name="description" rows="4">{values?.description ?? ''}</textarea><p class="hint">{t('field.descriptionHint')}</p></div>
    </section>
    <section class="stack"><h2>{t('entry.sightings')}</h2>
      <div class="panel stack">
        <PictureList bind:this={pictures} max={MEDIA_MAX} onready={(working) => busy = working} />
        <SightingFields {values} onphoto={file => pictures?.offer(file)} />
      </div>
    </section>
    <details class="panel" open={detailed}>
      <summary>{t('entry.addDetails')}</summary>
      <div class="stack details"><ClaimFields {claims} radical={values?.radical} strokes={values?.strokes} /></div>
    </details>
    <SubmitBar {busy} label={t('nav.add')} cancel={href()} />
  </form>
</div>
<style>
  .heading { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  summary { cursor:pointer; font-weight:600 } .details { margin-top:18px }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
