<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import SightingCard from '$lib/components/SightingCard.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { recordCode } from '$lib/code'
  import { href, t } from '$lib/t'
  let { data, form } = $props()
  const title = $derived(t('sighting.moveTitle', { id: recordCode(data.id) }))
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
  <SightingCard sighting={data.sighting} />
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
  .find .input { flex:1 1 0; width:auto; min-width:0 }
  .pair { display:grid; grid-template-columns:repeat(2,minmax(0,240px)); gap:24px }
  .pair figure { margin:0; min-width:0 }
  .pair figcaption { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px }
</style>
