<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { recordCode } from '$lib/code'
  import { href, media, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.moveTitle', { id: recordCode(data.id) }))
  const facts = $derived([data.sighting.author, data.sighting.original_date ?? data.sighting.report_date, data.sighting.page].filter(Boolean).join(' · '))
  const only = $derived(data.only || form?.error === 'only')
  const here = $derived(href(`/entry/${data.id}/sighting/${data.sighting.id}/move`))
</script>

<Seo {title} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}#sighting-${data.sighting.id}`)}>← {t('history.back')}</a>
  <h1>{title}</h1>
  {#if only}<p class="notice bad" role="alert">{t('error.only')}</p>
  {:else if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>
  {:else if data.problem}<p class="notice bad" role="alert">{t(`error.${data.problem}`)}</p>{/if}
  <div class="evidence">
    {#if data.sighting.picture}<img src={media(data.sighting.picture.thumb_key)} alt="" />{/if}
    <div class="text">
      {#if data.sighting.title || data.sighting.place}<strong>{data.sighting.title || data.sighting.place}</strong>{/if}
      {#if facts}<span class="muted">{facts}</span>{/if}
    </div>
  </div>
  {#if !only}
    {#if data.pair}
      <div class="pair">
        {#each data.pair as tile, index (tile.id)}
          <figure class="stack">
            <figcaption><span class="code">{recordCode(tile.id)}</span> <span class="badge">{t(index ? 'sighting.moveTo' : 'sighting.moveFrom')}</span></figcaption>
            <Tile {tile} glyph={data.glyphs[tile.id]} />
          </figure>
        {/each}
      </div>
      <form method="POST" class="stack">
        <input type="hidden" name="rev" value={data.sighting.rev} />
        <input type="hidden" name="to" value={data.to} />
        <div class="field"><label for="summary">{t('sighting.removeReason')}</label><input id="summary" class="input" name="summary" maxlength="500" value={form?.summary ?? ''} /></div>
        <div class="row">
          <button class="button primary" type="submit" disabled={form?.error === 'conflict'}>{t('sighting.move')}</button>
          <a class="button" href={here}>{t('duplicate.other')}</a>
        </div>
      </form>
    {:else}
      <form method="GET" class="row find">
        <label class="sr-only" for="to">{t('duplicate.of')}</label>
        <input class="input" id="to" name="to" value={data.typed} placeholder={t('duplicate.of')} required />
        <button class="button primary" type="submit">{t('duplicate.compare')}</button>
      </form>
    {/if}
  {/if}
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .evidence { display:flex; align-items:center; gap:16px; padding:16px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .evidence img { flex:none; width:96px; height:96px; object-fit:contain; border-radius:6px; background:var(--surface-tile) }
  .text { display:flex; flex-direction:column; gap:4px; min-width:0; overflow-wrap:anywhere }
  .find .input { flex:1 1 0; width:auto; min-width:0 }
  .pair { display:grid; grid-template-columns:repeat(2,minmax(0,240px)); gap:24px }
  .pair figure { margin:0; min-width:0 }
  .pair figcaption { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px }
</style>
