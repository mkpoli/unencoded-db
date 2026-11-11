<script lang="ts">
  import { enhance } from '$app/forms'
  import { onDestroy, tick } from 'svelte'
  import { draftSubmit, type actionErrorKey } from '$lib/draft-submit'
  import Seo from '$lib/components/Seo.svelte'
  import PicturePicker from '$lib/components/PicturePicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
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
  const title = $derived(t('sighting.addTitle', { id: data.id }))
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if actionError || (!pending && form?.error)}<p class="notice bad" role="alert" tabindex="-1" bind:this={errorNotice}>{t(`error.${actionError || form?.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data" use:enhance={submission.submit}>
    <section class="panel stack">
      <PicturePicker optional onready={(working) => busy = working} />
      <SightingFields values={form?.values ?? {}} />
    </section>
    <SubmitBar busy={busy || pending} busyLabel={t(pending ? 'form.saving' : 'field.imageWorking')} label={t('entry.addSighting')} cancel={href(`/entry/${data.id}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
