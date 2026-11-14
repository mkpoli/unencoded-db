<script lang="ts">
  import { page } from '$app/state'
  import { claimLabel } from '$lib/claim-label'
  import { untrack } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import MarkedPicture from '$lib/components/MarkedPicture.svelte'
  import CopyButton from '$lib/components/CopyButton.svelte'
  import { characterLinks, descriptionLinks } from '$lib/links'
  import { encodedCharacter } from '$lib/ids'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import IdentityFields from '$lib/components/IdentityFields.svelte'
  import SenseFields from '$lib/components/SenseFields.svelte'
  import SenseList from '$lib/components/SenseList.svelte'
  import CategoryFields from '$lib/components/CategoryFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import type { CharacterFacts } from '$lib/encoded'
  import { compositionOf, encodingsOf, supportedBy, valuesOf } from '$lib/claims'
  import { analyze } from '$lib/composition'
  import { formationLabel, roleLabel } from '$lib/composition-labels'
  import { codePage, marksOf, registryLabel } from '$lib/registries'
  import { COLLECTIONS, genreOf } from '$lib/genres'
  import { boxesOf, evidenceFile } from '$lib/picture'
  import { CHECKS, readiness } from '$lib/readiness'
  import { STATUSES, parseSightingTypes } from '$lib/scripts'
  import type { Sighting, StoredImage } from '$lib/server/entries'
  import { href, locale, media, t, day } from '$lib/t'
  let { data, form } = $props()
  const entry = $derived(data.entry)
  const claims = $derived(data.claims)
  const editing = $derived(Boolean(form?.error && page.url.searchParams.has('/edit')))
  const editValues = $derived(editing && form?.values && 'script' in form.values ? form.values : { ...entry, claims })
  let filled = $state<CharacterFacts | null>(null)
  const editIds = $derived(valuesOf(editValues.claims, 'ids'))
  let primary = $state(untrack(() => editIds[0] ?? ''))
  const editComposition = $derived.by(() => { const found = compositionOf(editValues.claims); return found ? JSON.stringify(found) : '' })

  const sequences = $derived(valuesOf(claims, 'ids'))
  const analysis = $derived(sequences[0] ? analyze(sequences[0], compositionOf(claims)) : null)
  const ivd = $derived(valuesOf(claims, 'ivd')[0] ?? null)
  const encodings = $derived(encodingsOf(claims))
  const marks = $derived(marksOf(encodings))
  const genres = $derived(valuesOf(claims, 'genre').map(genreOf).filter(genre => genre !== null))
  const collections = $derived(COLLECTIONS.filter(collection => valuesOf(claims, 'collection').includes(collection.slug)))
  const tags = $derived(valuesOf(claims, 'tag'))
  const brief = (text: string) => [...text].length > 40 ? [...text].slice(0, 39).join('') + '…' : text
  const options = $derived(data.sightings.map(sighting => ({ token: String(sighting.id), value: String(sighting.id), label: `#${sighting.id} ${brief(sighting.place)}` })))
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

  let preparing = $state<string | null>(null)
  async function download(sighting: Sighting, picture: StoredImage, position: number) {
    preparing = picture.image_key
    try {
      const file = await evidenceFile(media(picture.image_key), boxesOf(picture.box), `record-${entry.id}-${sighting.id}-${position + 1}`)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(file)
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } finally { preparing = null }
  }
</script>

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
        <ul class="sequences">{#each sequences as sequence}<li><span class="ids">{sequence}</span><CopyButton text={sequence} /></li>{/each}</ul>
      </div>
      <p class="sites">{#each descriptionLinks(sequences[0], at) as link}<a class="text-link small" href={link.href} target="_blank" rel="noopener">{link.name} ↗</a>{/each}</p>
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
    <ul class="marks" aria-label={t('field.encodings')}>
      {#each marks as mark (mark.registry.id)}
        <li>{#if mark.href}<a class="badge encoded" href={mark.href} target="_blank" rel="noopener" title={mark.registry.label}>入{mark.registry.mark}</a>{:else}<span class="badge" class:encoded={mark.code !== null} title={mark.registry.label}>{mark.code === null ? '未入' : '入'}{mark.registry.mark}</span>{/if}</li>
      {/each}
    </ul>
    <dl class="facts">
      {#each encodings as encoding (encoding.charset + '|' + encoding.code)}
        {@const character = encoding.charset === 'unicode' ? encodedCharacter(encoding.code) : ''}
        {@const page = character ? null : codePage(encoding)}
        <div><dt>{registryLabel(encoding.charset)}</dt><dd>{#if character}<span class="character encoded">{character}</span><CopyButton text={character} /> {/if}{#if page}<a class="mono text-link" href={page} target="_blank" rel="noopener">{encoding.code} ↗</a>{:else}<span class="mono">{encoding.code}</span>{/if}{#if character}<span class="sites">{#each characterLinks(character, at) as link}<a class="text-link small" href={link.href} target="_blank" rel="noopener">{link.name} ↗</a>{/each}</span>{/if}</dd></div>
      {/each}
      {#if ivd}<div><dt>{t('field.ivd')}</dt><dd class:mono={ivd !== 'none'}>{ivd === 'none' ? t('field.ivdNone') : ivd}</dd></div>{/if}
      {#if entry.radical}<div><dt>{t('field.radical')}</dt><dd>{entry.radical}</dd></div>{/if}
      {#if entry.strokes != null}<div><dt>{t('field.strokes')}</dt><dd>{entry.strokes}</dd></div>{/if}
    </dl>
    <SenseList {claims} sightings={data.sightings.map(sighting => sighting.id)} />
    {#if entry.by_name && entry.created_at}<p class="hint">{t('entry.firstAdded', { name: entry.by_name, date: day(entry.created_at) })}</p>{/if}
  </section>
  {#if entry.status !== 'encoded'}
  <section class="panel stack">
    <h2>{t('ready.title')}</h2>
    <ul class="checks">{#each CHECKS as check}<li class:done={ready[check]}><span class="tick" aria-hidden="true">{ready[check] ? '✓' : '○'}</span>{t(`ready.${check}`)}</li>{/each}</ul>
    <a class="text-link small" href="https://www.unicode.org/irg/pp/" target="_blank" rel="noopener">{t('ready.rules')} ↗</a>
  </section>
  {/if}
  <details class="panel" open={editing}>
    <summary>{t('entry.edit')}</summary>
    <form class="stack form" method="POST" action="?/edit">
      {#if editing}<p class="notice bad" role="alert">{t(`error.${form?.error}`)}</p>{/if}
      <input type="hidden" name="rev" value={entry.rev} />
      {#key `${entry.id}:${entry.rev}:${editing}`}
        <IdsField values={editIds} bind:primary onfill={facts => filled = facts} />
        <div class="sheet">
          <CompositionField ids={primary} value={editComposition} />
          <ScriptPicker value={editValues.script} other={editValues.script_other} />
          <IdentityFields claims={editValues.claims} radical={editValues.radical} strokes={editValues.strokes} fill={filled} />
        </div>
        <div class="field"><label for="description">{t('field.description')}</label><textarea id="description" class="input" name="description">{editValues.description ?? ''}</textarea></div>
        <SenseFields claims={editValues.claims} evidence={options} fill={filled} />
        <div class="field"><label for="status">{t('field.status')}</label><select id="status" class="input" name="status" value={editValues.status ?? 'unchecked'}>{#each STATUSES as status}<option value={status}>{t(`status.${status}`)}</option>{/each}</select><p class="hint">{t('field.statusHint')}</p></div>
        <details class="filing" open>
          <summary class="section-title">{t('field.filing')}</summary>
          <div class="stack filed"><CategoryFields genres={valuesOf(editValues.claims, 'genre')} collections={valuesOf(editValues.claims, 'collection')} tags={valuesOf(editValues.claims, 'tag')} /></div>
        </details>
      {/key}
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
              <figure>
                <MarkedPicture {picture} alt="{sighting.place || t('field.image')} {position + 1}" />
                <figcaption><button class="button small" type="button" title={t('sighting.evidenceHint')} disabled={preparing === picture.image_key} onclick={() => download(sighting, picture, position)}>{t('sighting.evidence')}</button></figcaption>
              </figure>
            {/each}
          </div>
        {/if}
        <h3>{sighting.place}</h3>
        {#if types.length}<div class="row badges">{#each types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
        {#if sighting.url && /^https?:\/\//i.test(sighting.url)}<a class="text-link url" href={sighting.url} target="_blank" rel="noopener noreferrer">{sighting.url} ↗</a>{/if}
        {#if sighting.via_id}
          <p class="via"><span class="muted">{t('field.via')}</span>
            <a class="text-link" href={href(`/source/${sighting.via_id}`)}>{sighting.via_title || sighting.via_url || t('source.title')}</a>
            {#if sighting.via_url && /^https?:\/\//i.test(sighting.via_url)}<a class="text-link url" href={sighting.via_url} target="_blank" rel="noopener noreferrer">↗</a>{/if}</p>
        {/if}
        <dl class="facts">{#each sourceFields as field}{#if sighting[field.key]}<div><dt>{t(field.label)}</dt><dd>{sighting[field.key]}</dd></div>{/if}{/each}
          {#if sighting.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${sighting.context}`)}</dd></div>{/if}
          {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
        </dl>
        {#if sighting.note}<p class="description">{sighting.note}</p>{/if}
        {#if supportedBy(claims, sighting.id).length}
          <p class="supports"><span class="muted">{t('sighting.supports')}</span>
            {#each supportedBy(claims, sighting.id) as claim (claim.key)}<a class="supported" href="#claim-{claim.key}"><span class="kind">{t(claim.kind === 'relation' ? 'field.relatedCharacter' : `field.${claim.kind}`)}</span><span class="text">{claimLabel(claim)}</span></a>{/each}
          </p>
        {/if}
        {#if sighting.by_name}<p class="hint">{t('sighting.by', { name: sighting.by_name })}</p>{/if}
        <div class="row">
          {#if sighting.source_id}<a class="text-link small" href={href(`/source/${sighting.source_id}`)}>{t('source.view')}</a>{/if}
          <a class="text-link small" href={href(`/entry/${entry.id}/sighting/${sighting.id}/edit`)}>{t('sighting.edit')}</a>
          <a class="text-link small" href={href(`/new?sighting=${sighting.id}`)}>{t('sighting.addAnother')}</a>
          <a class="text-link small" href={href(`/entry/${entry.id}/report?sighting=${sighting.id}`)}>{t('entry.report')}</a>
        </div>
      </article>
    {/each}
    <div class="row"><a class="button primary" href={href(`/entry/${entry.id}/sighting/new`)}>{t('entry.addSighting')}</a></div>
  </section>
</div>
<style>
  summary { cursor:pointer; font-weight:600 } .form { margin-top:18px }
  .sheet { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px dashed var(--line) } .filed { margin-top:14px }
  .back { align-self:start; color:var(--muted) } .title { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  h3 { font-size:14px; font-weight:600 }
  .identity { display:flex; align-items:center; gap:18px; min-width:0 }
  .plate { flex:none; display:grid; place-items:center; width:96px; height:96px; border-radius:8px; background:var(--surface-tile) }
  .sites { display:flex; flex-wrap:wrap; gap:4px 12px; margin:0 } dd .sites { margin-top:4px }
  .sequences { display:flex; flex-direction:column; gap:2px; min-width:0; margin:0; padding:0; list-style:none }
  .sequences li { display:flex; align-items:center; gap:4px; font-size:22px; line-height:1.35 } .sequences li + li { font-size:16px; color:var(--muted) }
  .formation { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px } .formation .label { color:var(--muted); font-size:12px; font-weight:400 }
  .method { font-weight:600 } .part { padding:1px 8px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:12.5px }
  .description { white-space:pre-wrap; overflow-wrap:anywhere } .badges { gap:6px }
  .chips { display:flex; flex-wrap:wrap; gap:6px } .chip-link { padding:2px 10px; border:1px solid var(--line); border-radius:999px; font-size:13px } .chip-link:hover { border-color:var(--accent); color:var(--accent) } .chip-link.tag { color:var(--muted) }
  .marks { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none } .marks a:hover { text-decoration:underline }
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:12px; margin:0 } .facts:empty { display:none }
  dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .character { font-size:20px; line-height:1.3 } .character.encoded { font-family:inherit; vertical-align:middle }
  .supports { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin:0; min-width:0 }
  .supported { display:inline-flex; align-items:baseline; gap:6px; min-width:0; max-width:100%; padding:1px 9px; border:1px solid var(--line); border-radius:999px; font-size:12.5px } .supported:hover { border-color:var(--accent); color:var(--accent) }
  .supported .kind { flex:none; color:var(--muted); font-size:11.5px } .supported .text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  article:target { outline:2px solid var(--accent); outline-offset:2px } article { scroll-margin-block:16px }
  .checks { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:6px 16px; margin:0; padding:0; list-style:none; color:var(--muted) }
  .checks li { display:flex; gap:8px } .checks li.done { color:var(--ink) } .checks li.done .tick { color:var(--good) } .tick { flex:none; width:1em; text-align:center }
  .pictures { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px } .pictures.single { grid-template-columns:minmax(0,1fr) }
  figure { display:flex; flex-direction:column; gap:6px; margin:0; min-width:0 }
  .pictures:not(.single) { --picture-height: 260px }
  .button.small { min-height:32px; padding:4px 10px; font-size:12.5px }
  .url { overflow-wrap:anywhere }
  .via { margin:0; overflow-wrap:anywhere }
  @media(max-width:700px) { .panel { padding:16px } .plate { width:72px; height:72px } }
</style>
