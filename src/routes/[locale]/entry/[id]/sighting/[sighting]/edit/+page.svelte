<script lang="ts">
  import { untrack } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import PictureList from '$lib/components/PictureList.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { MEDIA_MAX } from '$lib/limits'
  import { href, media, t } from '$lib/t'
  let { data, form } = $props()
  let busy = $state(false)
  let pictures = $state<PictureList>()
  const title = $derived(t('sighting.editTitle', { id: data.id }))
  let removed = $state<string[]>(untrack(() => form?.removeMedia ?? []))
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
            <label class="picture" class:gone={removed.includes(String(position))}>
              <img src={media(picture.thumb_key)} alt="{t('field.image')} {position + 1}" loading="lazy" />
              <span class="remove"><input type="checkbox" name="remove_media" value={String(position)} bind:group={removed} /> {t('sighting.removePicture')}</span>
            </label>
          {/each}
        </div>
      {/if}
      <PictureList bind:this={pictures} max={room} onready={(working) => busy = working} />
      <SightingFields values={form?.values ?? data.sighting} onphotos={files => pictures?.offer(files)} />
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
    </section>
    {#if form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar {busy} cancel={href(`/entry/${data.id}`)} />{/if}
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .current { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px }
  .picture { display:flex; flex-direction:column; gap:6px; cursor:pointer }
  .picture img { display:block; width:100%; aspect-ratio:1; object-fit:contain; border-radius:6px; background:var(--surface-sunken) }
  .picture.gone img { opacity:.35 }
  .remove { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
