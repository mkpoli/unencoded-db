<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import MarkedPicture from '$lib/components/MarkedPicture.svelte'
  import { cleanIds } from '$lib/ids'
  import { href, t } from '$lib/t'
  let { data } = $props()
  const source = $derived(data.source)
  const heading = $derived(source.title || source.url || t('source.title'))
  const facts = [
    { key: 'title', label: 'field.title' },
    { key: 'author', label: 'field.author' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
  ] as const
  const seenFacts = [
    { key: 'page', label: 'field.page' },
    { key: 'original_date', label: 'field.originalDate' },
  ] as const
  const records = $derived(new Set(data.sightings.map(sighting => sighting.entry_id)).size)
</script>

<Seo title={heading} />
<div class="page narrow stack">
  <a class="text-link back" href={href()}>← {t('nav.browse')}</a>
  <section class="panel stack intro">
    <span class="badge">{t('source.title')}</span>
    <h1>{heading}</h1>
    {#if source.url && /^https?:\/\//i.test(source.url)}<a class="text-link url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url} ↗</a>{/if}
    <dl class="facts">{#each facts as fact}{#if source[fact.key]}<div><dt>{t(fact.label)}</dt><dd>{source[fact.key]}</dd></div>{/if}{/each}</dl>
  </section>
  <section class="stack">
    <div class="row"><h2>{t('entry.sightings')}</h2><span class="badge">{data.sightings.length}</span><span class="badge">{t(records === 1 ? 'source.record' : 'source.records', { n: records })}</span></div>
    {#each data.sightings as sighting (sighting.id)}
      {@const tile = sighting.tile}
      <article class="panel seen" id="sighting-{sighting.id}">
        <a class="record" href={href(`/entry/${tile.id}#sighting-${sighting.id}`)}>
          <span class="plate">{#if tile.ids}<IdsGlyph ids={tile.ids} path={data.glyphs?.[cleanIds(tile.ids)]} />{:else}<span class="small muted">{t('browse.noImage')}</span>{/if}</span>
          <span class="ids">{tile.ids ?? ''}</span>
          <span class="small muted">{t('entry.record', { id: tile.id })}</span>
        </a>
        <div class="stack body">
          {#if sighting.media.length}
            <div class="pictures" class:single={sighting.media.length === 1}>
              {#each sighting.media as picture, position (picture.image_key)}<MarkedPicture {picture} alt="{sighting.place} {position + 1}" />{/each}
            </div>
          {/if}
          {#if sighting.via}<span class="badge via">{t('source.foundVia')}</span>{/if}
          <h3>{sighting.place}</h3>
          {#if sighting.types.length}<div class="row badges">{#each sighting.types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
          <dl class="facts">{#each seenFacts as fact}{#if sighting[fact.key]}<div><dt>{t(fact.label)}</dt><dd>{sighting[fact.key]}</dd></div>{/if}{/each}
            {#if sighting.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${sighting.context}`)}</dd></div>{/if}
            {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
          </dl>
          {#if sighting.note}<p class="note">{sighting.note}</p>{/if}
          <div class="row"><a class="button small" href={href(`/new?sighting=${sighting.id}`)}>{t('sighting.addAnother')}</a></div>
        </div>
      </article>
    {/each}
  </section>
</div>

<style>
  .back { align-self:start; color:var(--muted) }
  .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .intro { gap:8px } .intro .badge { align-self:start }
  .url { overflow-wrap:anywhere }
  .facts { display:flex; flex-wrap:wrap; gap:12px 28px; margin:0 } .facts:empty { display:none } dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .seen { display:grid; grid-template-columns:110px minmax(0,1fr); gap:20px; align-items:start }
  .record { display:flex; flex-direction:column; align-items:center; gap:4px; color:inherit; text-decoration:none; min-width:0 }
  .plate { display:grid; place-items:center; width:96px; height:96px; border-radius:8px; background:var(--surface-sunken); overflow:hidden }
  .record .ids { max-width:100%; overflow-wrap:anywhere; text-align:center }
  .record:hover .ids { text-decoration:underline }
  .body { gap:10px; min-width:0 }
  .pictures { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; --picture-height:260px } .pictures.single { grid-template-columns:minmax(0,1fr); --picture-height:65vh }
  .note { margin:0; white-space:pre-wrap; overflow-wrap:anywhere }
  h3 { margin:0 } .badge.via { align-self:start }
  @media(max-width:600px) { .panel { padding:16px } .seen { grid-template-columns:minmax(0,1fr) } .record { flex-direction:row; justify-content:flex-start; gap:10px } .plate { width:56px; height:56px } }
</style>
