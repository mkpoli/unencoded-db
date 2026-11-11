<script lang="ts">
  import { enhance } from '$app/forms'
  import { onDestroy, tick } from 'svelte'
  import { draftSubmit, type actionErrorKey } from '$lib/draft-submit'
  import Seo from '$lib/components/Seo.svelte'
  import PicturePicker from '$lib/components/PicturePicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { href, media, t } from '$lib/t'
  let { data, form } = $props()
  let busy = $state(false), pending = $state(false)
  let errorNotice = $state<HTMLParagraphElement>()
  let actionError = $state<ReturnType<typeof actionErrorKey> | null>(null)
  const submission = draftSubmit({
    blocked: () => busy || form?.error === 'conflict',
    setPending: value => pending = value,
    setError: value => actionError = value,
    focusError: async () => { await tick(); errorNotice?.focus() },
  })
  onDestroy(submission.destroy)
  const title = $derived(t('sighting.editTitle', { id: data.id }))
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if actionError || form?.error}<p class="notice bad" role="alert" tabindex="-1" bind:this={errorNotice}>{t(`error.${actionError || form?.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data" use:enhance={submission.submit}>
    <input type="hidden" name="rev" value={data.sighting.rev} />
    <section class="panel stack">
      {#if data.sighting.image_key}
        <img class="current" src={media(data.sighting.image_key)} alt={data.sighting.place || t('field.image')} />
        <label><input type="checkbox" name="remove_image" value="1" checked={form?.removeImage ?? false} /> {t('sighting.removeImage')}</label>
        <p class="hint">{t('sighting.keepImage')}</p>
      {/if}
      <PicturePicker optional onready={(working) => busy = working} />
      <SightingFields values={form?.values ?? data.sighting} />
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
    </section>
    {#if form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar busy={busy || pending} busyLabel={t(pending ? 'form.saving' : 'field.imageWorking')} cancel={href(`/entry/${data.id}`)} />{/if}
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .current { display:block; max-width:100%; max-height:45vh; object-fit:contain; margin:auto }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
