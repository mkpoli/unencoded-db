<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { overweight } from '$lib/weigh'
  import { tick } from 'svelte'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data, form } = $props()
  let adding = $state(false), found = $state(false)
  const busy = $derived(adding || found)
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.addTitle', { id: recordCode(data.id) }))
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
      <PictureList bind:this={pictures} max={MEDIA_MAX} onready={(working) => adding = working} />
      <SightingFields values={form?.values ?? {}} onphotos={files => pictures?.offer(files)} onready={working => found = working} />
    </section>
    <SubmitBar {busy} label={t('entry.addSighting')} cancel={href(`/entry/${data.id}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
