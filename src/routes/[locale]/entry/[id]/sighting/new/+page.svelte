<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import PicturePicker from '$lib/components/PicturePicker.svelte'
  import SightingFields from '$lib/components/SightingFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  let busy = $state(false)
  const title = $derived(t('sighting.addTitle', { id: data.id }))
</script>

<Seo {title} />
<div class="page narrow stack">
  <h1>{title}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <form class="stack" method="POST" enctype="multipart/form-data">
    <section class="panel stack">
      <PicturePicker optional onready={(working) => busy = working} />
      <SightingFields values={form?.values ?? {}} />
    </section>
    <SubmitBar {busy} label={t('entry.addSighting')} cancel={href(`/entry/${data.id}`)} />
  </form>
</div>
<style>
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
