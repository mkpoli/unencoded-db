<script lang="ts">
  import { untrack } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import StoredPicture from '$lib/components/StoredPicture.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { href, t } from '$lib/t'
  import { recordCode } from '$lib/code'
  let { data, form } = $props()
  let adding = $state(false)
  let marking = $state<Record<number, boolean>>({})
  const busy = $derived(adding || Object.values(marking).some(Boolean))
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.editTitle', { id: recordCode(data.id) }))
  let removed = $state<string[]>(untrack(() => form?.removeMedia ?? []))
  const drawn = $derived(form?.marks?.length === data.sighting.media.length ? form.marks : null)
  const room = $derived(MEDIA_MAX - data.sighting.media.length + removed.length)
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <input type="hidden" name="rev" value={data.sighting.rev} />
    <section class="panel stack">
      {#if data.sighting.media.length}
        <div class="current">
          {#each data.sighting.media as picture, position (picture.image_key)}
            <StoredPicture {picture} {position} drawn={drawn?.[position] ?? null} bind:removed onready={(working) => marking[position] = working} />
          {/each}
        </div>
      {/if}
      <PictureList bind:this={pictures} max={room} onready={(working) => adding = working} />
      <SightingFields values={form?.values ?? data.sighting} onphotos={files => pictures?.offer(files)} />
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
    </section>
    {#if form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar {busy} cancel={href(`/entry/${data.id}`)} />{/if}
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .current { display:flex; flex-direction:column; gap:16px }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
