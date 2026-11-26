<script lang="ts">
  import SourceQuotations from '$lib/components/SourceQuotations.svelte'
  import EvidenceDate from '$lib/components/EvidenceDate.svelte'
  import Seo from '$lib/components/Seo.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import MarkedPicture from '$lib/components/MarkedPicture.svelte'
  import ViaChain from '$lib/components/ViaChain.svelte'
  import { href, locale, t, when } from '$lib/t'
  import { kindName } from '$lib/source-kind'
  import { sourceHeading } from '$lib/source-name'
  import { recordCode } from '$lib/code'
  import { pictureAlt } from '$lib/picture'
  import { sourceData } from '$lib/structured-data'
  let { data, form } = $props()
  const source = $derived(data.source)
  const heading = $derived(sourceHeading(source, t))
  const structured = $derived(sourceData({ locale: locale(), source, name: heading, siteName: t('app.name'), sourcesName: t('nav.sources') }))
  const facts = [
    { key: 'title', label: 'field.title' },
    { key: 'author', label: 'field.author' },
    { key: 'container', label: 'field.container' },
    { key: 'source_kind', label: 'field.sourceKind' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
  ] as const
  const seenFacts = [
    { key: 'page', label: 'field.page' },
    { key: 'original_date', label: 'field.originalDate' },
  ] as const
  // The card draws the thumbnail of the first picture of the first sighting that cites the work itself.
  const artwork = $derived(data.sightings.find(sighting => !sighting.via && sighting.media.length)?.media[0]?.thumb_key ?? '')
  const records = $derived(new Set(data.sightings.map(sighting => sighting.entry_id)).size)
</script>

<Seo data={structured} title={heading} description={[t('source.title'), heading, source.author, source.publisher, source.report_date].filter(Boolean).join(' · ')}
  image={href(`/source/${source.id}/card.png?v=${encodeURIComponent(artwork.slice(0, 16))}`)} imageAlt={heading} />
<div class="page narrow stack">
  <a class="text-link back" href={href('/sources')}>← {t('nav.sources')}</a>
  <section class="panel stack intro">
    <span class="badge">{t('source.title')}</span>
    <h1>{heading}</h1>
    {#if source.url && /^https?:\/\//i.test(source.url)}<a class="text-link url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url} ↗</a>{/if}
    <dl class="facts">{#each facts as fact}{#if source[fact.key]}<div><dt>{t(fact.label)}</dt><dd>{#if fact.key === 'report_date'}<EvidenceDate text={source.report_date} reading={data.dates.get(source.report_date ?? '')} />{:else if fact.key === 'source_kind'}{kindName(source.source_kind)}{:else}{source[fact.key]}{/if}</dd></div>{/if}{/each}</dl>
    {#if data.copy}<a class="text-link" href={href(`/sources/copy/${data.copy.slug}`)}>{t('sources.digitizedCopy')} · {data.copy.title} · {data.copy.collection}</a>{/if}
    <details class="aliases" open={form != null || data.aliases.length > 0 || data.before !== null}>
      <summary>{t('source.aliases')}{#if data.aliases.length} ({data.aliases.length}){/if}</summary>
      {#each data.aliases as alias}
        <form class="row" method="POST" action="?/removeAlias">
          <span>{alias}</span><input type="hidden" name="alias" value={alias} />
          <button class="text-button" aria-label={t('source.removeAlias', { alias })}>{t('source.remove')}</button>
        </form>
      {/each}
      <form method="POST" action="?/addAlias" class="row add-alias">
        <label for="alias">{t('source.alias')}</label>
        <input id="alias" class="input" name="alias" maxlength="300" required value={form?.value ?? ''} />
        <button class="button">{t('source.addAlias')}</button>
      </form>
      {#if data.changes.length}
        <details id="alias-history" open={data.before !== null}><summary>{t('nav.history')}</summary>
          <ul>{#each data.changes as change (change.id)}
            <li>{t(change.removed ? 'source.aliasRemoved' : 'source.aliasAdded', { alias: change.spelling })} · <a class="text-link" href={href(`/u/${change.actor}`)}>{change.name}</a> · <time datetime={change.at}>{when(change.at)}</time></li>
          {/each}</ul>
          {#if data.older}<a class="text-link" href={`?before=${data.older}#alias-history`}>{t('browse.more')}</a>{/if}
        </details>
      {/if}
      {#if form?.aliasError}<p role="alert">{t('source.aliasError')}</p>{/if}
    </details>
  </section>
  <section class="stack">
    <div class="row"><h2>{t('entry.sightings')}</h2><span class="badge">{data.sightings.length}</span><span class="badge">{t(records === 1 ? 'source.record' : 'source.records', { n: records })}</span></div>
    {#each data.sightings as sighting (sighting.id)}
      {@const tile = sighting.tile}
      <article class="panel seen" id="sighting-{sighting.id}">
        <a class="record" href={href(`/entry/${tile.id}#sighting-${sighting.id}`)}>
          <span class="plate">{#if tile.ids}<IdsGlyph ids={tile.ids} layout={tile.layout} path={data.glyphs?.[tile.id]} />{:else}<span class="small muted">{t('browse.noImage')}</span>{/if}</span>
          <span class="ids">{tile.ids ?? ''}</span>
          <span class="small muted">{recordCode(tile.id)}</span>
        </a>
        <div class="stack body">
          {#if sighting.media.length}
            <div class="pictures" class:single={sighting.media.length === 1}>
              {#each sighting.media as picture, position (picture.image_key)}<MarkedPicture {picture} alt={pictureAlt([tile.ids, recordCode(tile.id), sighting.via ? null : source.title, sighting.place], position, sighting.media.length)} />{/each}
            </div>
          {/if}
          {#if sighting.via}<span class="badge via">{t('source.foundVia')}</span>{/if}
          {#if sighting.vias.length}<ViaChain vias={sighting.vias} dates={data.dates} label={!sighting.via} />{/if}
          {#if sighting.place}<h3>{sighting.place}</h3>{/if}
          {#if sighting.types.length}<div class="row badges">{#each sighting.types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
          <dl class="facts">{#each seenFacts as fact}{#if sighting[fact.key]}<div><dt>{t(fact.label)}</dt><dd>{#if fact.key === 'original_date'}<EvidenceDate text={sighting.original_date} reading={data.dates.get(sighting.original_date ?? '')} />{:else}{sighting[fact.key]}{/if}</dd></div>{/if}{/each}
            {#if sighting.contexts.length}<div><dt>{t('field.context')}</dt><dd>{sighting.contexts.map(context => t(`context.${context}`)).join(' · ')}</dd></div>{/if}
            {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
          </dl>
          {#if !sighting.via}<SourceQuotations quotes={sighting.quotes} url={source.url} />{/if}
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
  .aliases summary { cursor:pointer; width:fit-content }
  .aliases form { margin-top:8px; overflow-wrap:anywhere }
  .add-alias .input { width:min(100%, 18rem) }
  .url { overflow-wrap:anywhere }
  .facts { display:flex; flex-wrap:wrap; gap:12px 28px; margin:0 } .facts:empty { display:none } dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .seen { display:grid; grid-template-columns:110px minmax(0,1fr); gap:20px; align-items:start }
  .record { display:flex; flex-direction:column; align-items:center; gap:4px; color:inherit; text-decoration:none; min-width:0 }
  .plate { display:grid; place-items:center; width:96px; height:96px; border-radius:8px; background:var(--surface-sunken); overflow:hidden }
  .record .ids { max-width:100%; overflow-wrap:anywhere; text-align:center }
  .record:hover .ids { text-decoration:underline }
  .body { gap:10px; min-width:0 }
  .pictures { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr)); gap:12px } .pictures.single { grid-template-columns:minmax(0,1fr) }
  .pictures:not(.single) { --picture-height:260px }
  .note { margin:0; white-space:pre-wrap; overflow-wrap:anywhere }
  h3 { margin:0 } .badge.via { align-self:start }
  @media(max-width:600px) { .panel { padding:16px } .seen { grid-template-columns:minmax(0,1fr) } .record { flex-direction:row; justify-content:flex-start; gap:10px } .plate { width:56px; height:56px } }
</style>
