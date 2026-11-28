<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import RecordPicker from '$lib/components/RecordPicker.svelte'
  import Tile from '$lib/components/Tile.svelte'
  import { recordCode } from '$lib/code'
  import { RELATION_KINDS } from '$lib/related'
  import { href, media, t } from '$lib/t'
  let { data, form } = $props()
  const other = $derived(data.pair?.find(tile => tile.id !== data.id))
</script>

<Seo title={t('duplicate.title')} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/${recordCode(data.id)}`)}>← {t('history.back')}</a>
  <h1>{t('duplicate.title')}</h1>
  {#if form?.error}<p class="notice bad" role="alert">{t(`error.${form.error}`)}</p>{/if}
  {#if data.pair && other}
    <div class="pair">
      {#each data.pair as tile, index (tile.id)}
        <figure class="stack">
          <figcaption><span class="code">{recordCode(tile.id)}</span> <span class="badge">{t(index ? 'duplicate.joins' : 'duplicate.stays')}</span></figcaption>
          <Tile {tile} glyph={data.glyphs[tile.id]} />
          {#if tile.cover_key}<a href={href(`/${recordCode(tile.id)}`)}><img src={media(tile.cover_key)} alt={t('entry.record', { id: recordCode(tile.id) })} loading="lazy" decoding="async" /></a>{/if}
        </figure>
      {/each}
    </div>
    <form method="POST" action="?/merge&of={other.id}" class="stack decision">
      <input type="hidden" name="of" value={other.id} />
      <div class="field">
        <label for="summary">{t('form.summary')}</label>
        <input class="input" id="summary" name="summary" maxlength="500" />
      </div>
      <div><button class="button primary" type="submit">{t('duplicate.merge')}</button></div>
    </form>
    <form method="POST" action="?/apart&of={other.id}" class="stack decision">
      <input type="hidden" name="of" value={other.id} />
      <div class="grid-2">
        <div class="field">
          <label for="relationship">{t('field.relatedRelationship')}</label>
          <select class="input" id="relationship" name="relationship" required>
            <option value="" hidden></option>
            {#each RELATION_KINDS as kind}<option value={kind}>{t(`relationship.${kind}`)}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label for="difference">{t('field.relatedDifference')}</label>
          <input class="input" id="difference" name="difference" maxlength="5000" />
        </div>
      </div>
      <div><button class="button" type="submit">{t('duplicate.apart')}</button></div>
    </form>
    <a class="text-link back" href={href(`/${recordCode(data.id)}/duplicate`)}>{t('duplicate.other')}</a>
  {:else}
    {#if data.unknown}<p class="notice bad" role="alert">{t('error.missing')}</p>{/if}
    <form method="GET" class="row find">
      <RecordPicker id="of" name="of" value={data.typed} exclude={data.id} label={t('duplicate.of')} placeholder={t('duplicate.of')} />
      <button class="button primary" type="submit">{t('duplicate.compare')}</button>
    </form>
    {#if data.alike.length}
      <h2>{t('duplicate.alike')}</h2>
      <div class="tiles">
        {#each data.alike as tile (tile.id)}<Tile {tile} glyph={data.glyphs[tile.id]} to={href(`/${recordCode(data.id)}/duplicate?of=${tile.id}`)} />{/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .back { align-self: start; color: var(--muted) }
  .decision { padding-top: 16px; border-top: 1px solid var(--line) }
  .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 280px)); gap: 24px }
  .pair figure { margin: 0; min-width: 0 }
  .pair figcaption { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px }
  .pair img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line) }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--tile-size), 100%), 1fr)); gap: 22px 16px }
</style>
