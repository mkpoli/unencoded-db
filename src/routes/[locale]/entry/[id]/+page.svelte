<script lang="ts">
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import ClaimFields from '$lib/components/ClaimFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { claimsOf, compositionOf, encodingsOf, relationsOf, valuesOf, type Claim } from '$lib/claims'
  import { analyze } from '$lib/composition'
  import { formationLabel, roleLabel } from '$lib/composition-labels'
  import { encodingSetLabel } from '$lib/encodings'
  import { COLLECTIONS, genreOf } from '$lib/genres'
  import { evidenceFile, type Box } from '$lib/picture'
  import { CHECKS, readiness } from '$lib/readiness'
  import { STATUSES, parseSightingTypes } from '$lib/scripts'
  import type { Sighting, StoredImage } from '$lib/server/entries'
  import { href, locale, media, t, day } from '$lib/t'
  let { data, form } = $props()
  const entry = $derived(data.entry)
  const claims = $derived(data.claims)
  const editing = $derived(Boolean(form?.error && page.url.searchParams.has('/edit')))
  const editValues = $derived(editing && form?.values && 'script' in form.values ? form.values : { ...entry, claims })
  let ids = $derived.by(() => {
    entry.id
    return valuesOf(editValues.claims, 'ids').join(', ')
  })
  const editComposition = $derived.by(() => { const found = compositionOf(editValues.claims); return found ? JSON.stringify(found) : '' })

  const sequences = $derived(valuesOf(claims, 'ids'))
  const analysis = $derived(sequences[0] ? analyze(sequences[0], compositionOf(claims)) : null)
  const ivd = $derived(valuesOf(claims, 'ivd')[0] ?? null)
  const normalizesTo = $derived(valuesOf(claims, 'normalizes_to')[0] ?? null)
  const encodings = $derived(encodingsOf(claims))
  const relations = $derived(relationsOf(claims))
  const genres = $derived(valuesOf(claims, 'genre').map(genreOf).filter(genre => genre !== null))
  const collections = $derived(COLLECTIONS.filter(collection => valuesOf(claims, 'collection').includes(collection.slug)))
  const tags = $derived(valuesOf(claims, 'tag'))
  const options = $derived(data.sightings.map(sighting => ({ id: sighting.id, place: sighting.place })))
  const ready = $derived(readiness({ ids: entry.ids, radical: entry.radical, strokes: entry.strokes }, data.sightings))

  const sourceFields = [
    { key: 'author', label: 'field.author' },
    { key: 'title', label: 'field.title' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
    { key: 'original_date', label: 'field.originalDate' },
    { key: 'page', label: 'field.page' },
  ] as const
  const at = locale()

  const boxOf = (picture: StoredImage): Box | null => {
    try { const box = JSON.parse(picture.box ?? 'null'); return Array.isArray(box) && box.length === 4 ? box as Box : null } catch { return null }
  }
  let preparing = $state<string | null>(null)
  async function download(sighting: Sighting, picture: StoredImage, position: number) {
    preparing = picture.image_key
    try {
      const file = await evidenceFile(media(picture.image_key), boxOf(picture), `record-${entry.id}-${sighting.id}-${position + 1}`)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(file)
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } finally { preparing = null }
  }
</script>

{#snippet basis(claim: { sighting_id: number | null })}{#if claim.sighting_id}<a class="basis" href="#sighting-{claim.sighting_id}">#{claim.sighting_id}</a>{/if}{/snippet}
{#snippet texts(items: Claim[])}<ul class="claims">{#each items as claim}<li>{claim.value}{@render basis(claim)}</li>{/each}</ul>{/snippet}

<Seo title={t('entry.record', { id: entry.id })} image={entry.cover_key ? media(entry.cover_key) : null} />
<div class="page narrow stack">
  <div class="row"><a class="text-link back" href={href()}>← {t('nav.browse')}</a><a class="text-link" href={href(`/entry/${entry.id}/history`)}>{t('entry.history')}</a><a class="text-link" href={href(`/entry/${entry.id}/report`)}>{t('entry.report')}</a></div>
  <div class="heading"><div class="stack title"><h1>{t('entry.record', { id: entry.id })}</h1><div class="row"><span class="badge">{entry.script === 'other' && entry.script_other ? entry.script_other : t(`script.${entry.script}`)}</span><span class="badge {entry.status}">{t(`status.${entry.status}`)}</span></div></div></div>
  {#if entry.hidden_at}<p class="notice bad">{t('entry.hidden')}</p>{/if}
  {#if entry.merged_into}<p class="notice quiet"><a class="text-link" href={href(`/entry/${entry.merged_into}`)}>{t('entry.mergedInto', { id: entry.merged_into })}</a></p>{/if}
  <section class="panel stack">
    <h2>{t('entry.about')}</h2>
    {#if sequences.length}
      <div class="identity">
        <span class="plate"><IdsGlyph ids={sequences[0]} /></span>
        <ul class="sequences">{#each sequences as sequence}<li class="ids">{sequence}</li>{/each}</ul>
      </div>
    {/if}
    {#if analysis?.tagged}
      <p class="formation"><span class="label">{t('field.formation')}</span><span class="method">{formationLabel(at, analysis.formation)}</span>{#each analysis.parts.filter(part => part.role) as part, index (index)}<span class="part">{part.part} · {roleLabel(at, part.role)}</span>{/each}</p>
    {/if}
    <p class:muted={!entry.description} class="description">{entry.description || t('entry.noDescription')}</p>
    {#if genres.length || collections.length || tags.length}
      <p class="chips">
        {#each genres as genre (genre.slug)}<a class="chip-link" href={href(`?genre=${genre.slug}`)}>{genre.label}</a>{/each}
        {#each collections as collection (collection.slug)}<a class="chip-link" href={href(`?collection=${collection.slug}`)}>{collection.label}</a>{/each}
        {#each tags as tag}<a class="chip-link tag" href={href(`?tag=${encodeURIComponent(tag)}`)}>#{tag}</a>{/each}
      </p>
    {/if}
    <dl class="facts">
      {#if normalizesTo}<div><dt>{t('field.normalizesTo')}</dt><dd class="character">{normalizesTo}</dd></div>{/if}
      {#each encodings as encoding (encoding.charset + '|' + encoding.code)}<div><dt>{encodingSetLabel(encoding.charset)}</dt><dd class="mono">{encoding.code}</dd></div>{/each}
      {#if ivd}<div><dt>{t('field.ivd')}</dt><dd class:mono={ivd !== 'none'}>{ivd === 'none' ? t('field.ivdNone') : ivd}</dd></div>{/if}
      {#if entry.radical}<div><dt>{t('field.radical')}</dt><dd>{entry.radical}</dd></div>{/if}
      {#if entry.strokes != null}<div><dt>{t('field.strokes')}</dt><dd>{entry.strokes}</dd></div>{/if}
      {#if claimsOf(claims, 'reading').length}<div><dt>{t('field.reading')}</dt><dd>{@render texts(claimsOf(claims, 'reading'))}</dd></div>{/if}
      {#if claimsOf(claims, 'meaning').length}<div class="wide"><dt>{t('field.meaning')}</dt><dd>{@render texts(claimsOf(claims, 'meaning'))}</dd></div>{/if}
    </dl>
    {#if relations.length}
      <h3>{t('field.relatedCharacters')}</h3>
      <ul class="relations">
        {#each relations as relation}
          <li class="relation">
            <span class="character">{relation.character}</span>
            <span class="relation-body">
              <span class="badge">{t(`relationship.${relation.relationship}`)}</span>{@render basis(relation)}
              {#if relation.difference}<span class="description">{relation.difference}</span>{/if}
              {#if relation.evidence}<span class="description muted">{relation.evidence}</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if entry.by_name && entry.created_at}<p class="hint">{t('entry.firstAdded', { name: entry.by_name, date: day(entry.created_at) })}</p>{/if}
  </section>
  <section class="panel stack">
    <h2>{t('ready.title')}</h2>
    <ul class="checks">{#each CHECKS as check}<li class:done={ready[check]}><span class="tick" aria-hidden="true">{ready[check] ? '✓' : '○'}</span>{t(`ready.${check}`)}</li>{/each}</ul>
    <a class="text-link small" href="https://www.unicode.org/irg/pp/" target="_blank" rel="noopener">{t('ready.rules')} ↗</a>
  </section>
  <details class="panel" open={editing}>
    <summary>{t('entry.edit')}</summary>
    <form class="stack form" method="POST" action="?/edit">
      {#if editing}<p class="notice bad" role="alert">{t(`error.${form?.error}`)}</p>{/if}
      <input type="hidden" name="rev" value={entry.rev} />
      {#key entry.id}<ScriptPicker value={editValues.script} other={editValues.script_other} />{/key}
      <IdsField bind:value={ids} />
      <CompositionField {ids} value={editComposition} />
      <div class="field"><label for="description">{t('field.description')}</label><textarea id="description" class="input" name="description">{editValues.description ?? ''}</textarea></div>
      <div class="field"><label for="status">{t('field.status')}</label><select id="status" class="input" name="status" value={editValues.status ?? 'unchecked'}>{#each STATUSES as status}<option value={status}>{t(`status.${status}`)}</option>{/each}</select><p class="hint">{t('field.statusHint')}</p></div>
      {#key `${entry.id}:${entry.rev}:${editing}`}<ClaimFields claims={editValues.claims} radical={editValues.radical} strokes={editValues.strokes} sightings={options} />{/key}
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" /></div>
      {#if editing && form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar />{/if}
    </form>
  </details>
  <section class="stack"><h2>{t('entry.sightings')}</h2>
    {#each data.sightings as sighting (sighting.id)}
      {@const types = parseSightingTypes(sighting.types)}
      <article class="panel stack" id="sighting-{sighting.id}">
        {#if sighting.media.length}
          <div class="pictures" class:single={sighting.media.length === 1}>
            {#each sighting.media as picture, position (picture.image_key)}
              {@const box = boxOf(picture)}
              <figure>
                <a class="image" href={media(picture.image_key)}>
                  <span class="frame">
                    <img src={media(picture.image_key)} alt="{sighting.place || t('field.image')} {position + 1}" width={picture.image_w} height={picture.image_h} loading="lazy" />
                    {#if box}<span class="mark" style:left="{box[0] / picture.image_w * 100}%" style:top="{box[1] / picture.image_h * 100}%" style:width="{box[2] / picture.image_w * 100}%" style:height="{box[3] / picture.image_h * 100}%"></span>{/if}
                  </span>
                </a>
                <figcaption><button class="button small" type="button" title={t('sighting.evidenceHint')} disabled={preparing === picture.image_key} onclick={() => download(sighting, picture, position)}>{t('sighting.evidence')}</button></figcaption>
              </figure>
            {/each}
          </div>
        {/if}
        <h3>{sighting.place}</h3>
        {#if types.length}<div class="row badges">{#each types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
        {#if sighting.url && /^https?:\/\//i.test(sighting.url)}<a class="text-link url" href={sighting.url} target="_blank" rel="noopener noreferrer">{sighting.url} ↗</a>{/if}
        <dl class="facts">{#each sourceFields as field}{#if sighting[field.key]}<div><dt>{t(field.label)}</dt><dd>{sighting[field.key]}</dd></div>{/if}{/each}
          {#if sighting.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${sighting.context}`)}</dd></div>{/if}
          {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
        </dl>
        {#if sighting.note}<p class="description">{sighting.note}</p>{/if}
        {#if sighting.by_name}<p class="hint">{t('sighting.by', { name: sighting.by_name })}</p>{/if}
        <div class="row">
          {#if sighting.source_id}<a class="text-link small" href={href(`/source/${sighting.source_id}`)}>{t('source.view')}</a>{/if}
          <a class="text-link small" href={href(`/entry/${entry.id}/sighting/${sighting.id}/edit`)}>{t('sighting.edit')}</a>
          <a class="text-link small" href={href(`/entry/${entry.id}/report?sighting=${sighting.id}`)}>{t('entry.report')}</a>
        </div>
      </article>
    {/each}
    <div class="row"><a class="button primary" href={href(`/entry/${entry.id}/sighting/new`)}>{t('entry.addSighting')}</a></div>
  </section>
</div>
<style>
  summary { cursor:pointer; font-weight:600 } .form { margin-top:18px }
  .back { align-self:start; color:var(--muted) } .title { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  h3 { font-size:14px; font-weight:600 }
  .identity { display:flex; align-items:center; gap:18px; min-width:0 }
  .plate { flex:none; display:grid; place-items:center; width:96px; height:96px; border-radius:8px; background:var(--surface-tile) }
  .sequences { display:flex; flex-direction:column; gap:2px; min-width:0; margin:0; padding:0; list-style:none }
  .sequences li { font-size:22px; line-height:1.35 } .sequences li + li { font-size:16px; color:var(--muted) }
  .formation { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px } .formation .label { color:var(--muted); font-size:12px; font-weight:400 }
  .method { font-weight:600 } .part { padding:1px 8px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:12.5px }
  .description { white-space:pre-wrap; overflow-wrap:anywhere } .badges { gap:6px }
  .chips { display:flex; flex-wrap:wrap; gap:6px } .chip-link { padding:2px 10px; border:1px solid var(--line); border-radius:999px; font-size:13px } .chip-link:hover { border-color:var(--accent); color:var(--accent) } .chip-link.tag { color:var(--muted) }
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:12px; margin:0 } .facts:empty { display:none } .facts .wide { grid-column:1 / -1 }
  dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .character { font-size:20px; line-height:1.3 }
  .claims { margin:0; padding:0; list-style:none } .claims li { white-space:pre-wrap }
  .basis { margin-left:6px; color:var(--muted); font-size:11.5px } .basis:hover { color:var(--accent) }
  .relations { display:flex; flex-direction:column; gap:8px; margin:0; padding:0; list-style:none }
  .relation { display:flex; align-items:flex-start; gap:14px; padding:10px 12px; border:1px solid var(--line); border-radius:7px }
  .relation .character { flex:none; min-width:1.2em; font-size:26px; text-align:center }
  .relation-body { display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:0 }
  .checks { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:6px 16px; margin:0; padding:0; list-style:none; color:var(--muted) }
  .checks li { display:flex; gap:8px } .checks li.done { color:var(--ink) } .checks li.done .tick { color:var(--good) } .tick { flex:none; width:1em; text-align:center }
  .pictures { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px } .pictures.single { grid-template-columns:minmax(0,1fr) }
  figure { display:flex; flex-direction:column; gap:6px; margin:0; min-width:0 }
  .image { display:flex; justify-content:center; background:var(--surface-sunken); border-radius:6px; overflow:hidden }
  .frame { position:relative; display:inline-block; max-width:100%; line-height:0 }
  .frame img { display:block; width:auto; height:auto; max-width:100%; max-height:65vh } .pictures:not(.single) .frame img { max-height:260px }
  .mark { position:absolute; border:2px solid var(--mark); pointer-events:none }
  .button.small { min-height:32px; padding:4px 10px; font-size:12.5px }
  .url { overflow-wrap:anywhere }
  @media(max-width:700px) { .panel { padding:16px } .plate { width:72px; height:72px } }
</style>
