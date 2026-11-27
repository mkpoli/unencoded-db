<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { overweight } from '$lib/weigh'
  import { tick } from 'svelte'
  import { loadSeedPictures } from '$lib/seed-pictures'
  import { href, media, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  import { onMount } from 'svelte'
  let { data, form } = $props()
  let preparing = $state(false), seeding = $state(false), found = $state(false)
  const busy = $derived(preparing || seeding || found)
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.addTitle', { id: recordCode(data.id) }))

  // The pictures of the sighting the form starts from, fetched so that a new box can be drawn on each.
  onMount(() => {
    if (form || !data.seed?.pictures.length) return
    return loadSeedPictures(data.seed.pictures.map(media), blob => pictures?.add(blob), working => seeding = working)
  })
  // A form heavier than the server takes is stopped here, where what was typed is still on the page.
  let heavy = $state(false)
  let notice = $state<HTMLElement>()
  async function weigh(event: SubmitEvent) {
    heavy = overweight(event.currentTarget as HTMLFormElement)
    if (!heavy) return
    event.preventDefault()
    await tick()
    notice?.scrollIntoView({ block: 'center' })
  }
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if heavy || form?.error}<p class="notice bad" role="alert" bind:this={notice}>{heavy ? t('error.tooLarge') : t(`error.${form?.error}`, { most: MEDIA_MAX })}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data" onsubmit={weigh}>
    <section class="panel stack">
      {#if data.seed}<input type="hidden" name="seed" value={data.seed.id} />{/if}
      <PictureList bind:this={pictures} max={MEDIA_MAX} onready={(working) => preparing = working} />
      <SightingFields values={form?.values ?? data.seed?.values ?? {}} siblings={data.siblings} onphotos={files => pictures?.offer(files)} onready={working => found = working} />
    </section>
    <SubmitBar {busy} label={t('entry.addSighting')} cancel={href(`/${recordCode(data.id)}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
