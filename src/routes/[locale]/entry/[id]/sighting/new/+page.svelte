<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { href, media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import { onMount } from 'svelte'
  let { data, form } = $props()
  let preparing = $state(false)
  let seeding = $state(false)
  const busy = $derived(preparing || seeding)
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.addTitle', { id: recordCode(data.id) }))

  // The pictures of the sighting the form starts from, fetched so that a new box can be drawn on each.
  onMount(() => {
    if (form || !data.seed?.pictures.length) return
    const controller = new AbortController()
    seeding = true
    void (async () => {
      try {
        for (const key of data.seed?.pictures ?? []) {
          const response = await fetch(media(key), { signal: controller.signal }).catch(() => null)
          if (controller.signal.aborted) return
          if (response?.ok) await pictures?.add(await response.blob())
        }
      } finally {
        if (!controller.signal.aborted) seeding = false
      }
    })()
    return () => controller.abort()
  })
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel stack">
      <PictureList bind:this={pictures} max={MEDIA_MAX} onready={(working) => preparing = working} />
      <SightingFields values={form?.values ?? data.seed?.values ?? {}} onphotos={files => pictures?.offer(files)} />
    </section>
    <SubmitBar {busy} label={t('entry.addSighting')} cancel={href(`/entry/${data.id}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
