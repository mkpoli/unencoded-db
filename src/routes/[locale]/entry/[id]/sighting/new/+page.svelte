<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data, form } = $props()
  let busy = $state(false)
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.addTitle', { id: recordCode(data.id) }))
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel stack">
      <PictureList bind:this={pictures} max={MEDIA_MAX} onready={(working) => busy = working} />
      <SightingFields values={form?.values ?? {}} onphotos={files => pictures?.offer(files)} />
    </section>
    <SubmitBar {busy} label={t('entry.addSighting')} cancel={href(`/entry/${data.id}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
