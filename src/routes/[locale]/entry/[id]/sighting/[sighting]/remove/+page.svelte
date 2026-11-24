<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { recordCode } from '$lib/code'
  import { href, media, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.removeTitle', { id: recordCode(data.id) }))
  const facts = $derived([data.sighting.author, data.sighting.original_date ?? data.sighting.report_date, data.sighting.page].filter(Boolean).join(' · '))
  // Evidence that stands alone, as a load saw it or as the save found it.
  const only = $derived(data.only || form?.error === 'only')
</script>

<Seo {title} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>← {t('history.back')}</a>
  <h1>{title}</h1>
  {#if only}<p class="notice" role="alert">{t('error.only')}</p>
  {:else if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  <div class="evidence">
    {#if data.sighting.picture}<img src={media(data.sighting.picture.thumb_key)} alt="" />{/if}
    <div class="text">
      {#if data.sighting.title || data.sighting.place}<strong>{data.sighting.title || data.sighting.place}</strong>{/if}
      {#if facts}<span class="muted">{facts}</span>{/if}
    </div>
  </div>
  {#if !only}
    <form class="stack" method="POST">
      <input type="hidden" name="rev" value={data.sighting.rev} />
      <div class="field"><label for="summary">{t('sighting.removeReason')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
      <div class="row">
        <button class="button danger" type="submit" disabled={form?.error === 'conflict'}>{t('sighting.remove')}</button>
        <a class="button" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>{t('form.cancel')}</a>
      </div>
    </form>
  {/if}
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .evidence { display:flex; align-items:center; gap:16px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .evidence img { flex:none; width:96px; height:96px; object-fit:contain; border-radius:6px; background:var(--surface-tile) }
  .text { display:flex; flex-direction:column; gap:4px; min-width:0; overflow-wrap:anywhere }
</style>
