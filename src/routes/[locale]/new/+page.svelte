<script lang="ts">
  import { enhance } from '$app/forms'
  import { onDestroy, tick } from 'svelte'
  import { draftSubmit, type actionErrorKey } from '$lib/draft-submit'
  import Seo from '$lib/components/Seo.svelte'
  import PicturePicker from '$lib/components/PicturePicker.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import RelatedCharacters from '$lib/components/RelatedCharacters.svelte'
  import { href, t } from '$lib/t'
  let { form } = $props()
  let busy = $state(false), pending = $state(false)
  let errorNotice = $state<HTMLParagraphElement>()
  let actionError = $state<ReturnType<typeof actionErrorKey> | null>(null)
  const submission = draftSubmit({
    blocked: () => busy,
    setPending: value => pending = value,
    setError: value => actionError = value,
    focusError: async () => { await tick(); errorNotice?.focus() },
  })
  onDestroy(submission.destroy)
  let ids = $derived(form?.values?.ids ?? '')
  const label = (key: `${string}.${string}`, fallback: string) => { const text = t(key); return text === key ? fallback : text }
</script>

<Seo title={t('add.title')} />
<div class="page narrow stack">
  <div class="stack heading"><h1>{t('add.title')}</h1><p class="muted">{t('add.intro')}</p></div>
  {#if actionError || form?.error}<p class="notice bad" role="alert" tabindex="-1" bind:this={errorNotice}>{actionError ? t(`error.${actionError}`) : form?.error === 'relatedCharacters' ? label('error.relatedCharacters', 'Check each comparison and use at most 50. Character, relationship, differences and evidence must fit their limits.') : t(`error.${form?.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data" use:enhance={submission.submit}>
    <section class="panel stack"><ScriptPicker value={form?.values?.script} other={form?.values?.script_other} /><IdsField bind:value={ids} /><div class="field"><label for="description">{t('field.description')}</label><textarea class="input" id="description" name="description" rows="4">{form?.values?.description ?? ''}</textarea><p class="hint">{t('field.descriptionHint')}</p></div></section>
    <section class="stack"><h2>{t('entry.sightings')}</h2><div class="panel stack"><PicturePicker optional onready={(working) => busy = working} /><SightingFields values={form?.values} /></div></section>
    {#key form?.values?.related_characters}<RelatedCharacters value={form?.values?.related_characters} />{/key}
    <SubmitBar busy={busy || pending} busyLabel={t(pending ? 'form.saving' : 'field.imageWorking')} label={t('nav.add')} cancel={href()} />
  </form>
</div>
<style>
  .heading { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
