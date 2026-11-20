<script lang="ts">
  import RelatedRecords from '$lib/components/RelatedRecords.svelte'
  import SourceQuotations from '$lib/components/SourceQuotations.svelte'
  import EvidenceDate from '$lib/components/EvidenceDate.svelte'
  import { page } from '$app/state'
  import { claimLabel } from '$lib/claim-label'
  import { onMount, tick, untrack } from 'svelte'
  import Seo from '$lib/components/Seo.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import CharacterFields from '$lib/components/CharacterFields.svelte'
  import IdsGlyph from '$lib/components/IdsGlyph.svelte'
  import GlyphFace from '$lib/components/GlyphFace.svelte'
  import SpellingReport from '$lib/components/SpellingReport.svelte'
  import { GLYPH_STYLES } from '$lib/composer'
  import MarkedPicture from '$lib/components/MarkedPicture.svelte'
  import CopyButton from '$lib/components/CopyButton.svelte'
  import EditLink from '$lib/components/EditLink.svelte'
  import FavouriteButton from '$lib/components/FavouriteButton.svelte'
  import ShareRecord from '$lib/components/ShareRecord.svelte'
  import { characterLinks, descriptionLinks } from '$lib/links'
  import { cleanIds, encodedCharacter } from '$lib/ids'
  import { layoutText } from '$lib/layout'
  import { describedTable } from '$lib/encoded'
  import { equivalentSpellings, spellingGroups } from '$lib/ids-variants'
  import CompositionField from '$lib/components/CompositionField.svelte'
  import IdentityFields from '$lib/components/IdentityFields.svelte'
  import SenseEditor from '$lib/components/SenseEditor.svelte'
  import SenseList from '$lib/components/SenseList.svelte'
  import TagFields from '$lib/components/TagFields.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import { COMMENTS_SHOWN } from '$lib/comments'
  import Discussion from '$lib/components/Discussion.svelte'
  import ViaChain from '$lib/components/ViaChain.svelte'
  import type { Fill } from '$lib/encoded'
  import { compositionOf, encodingsOf, idsForms, primaryLayoutOf, supportedBy, valuesOf } from '$lib/claims'
  import { analyze } from '$lib/composition'
  import { formationLabel, roleLabel } from '$lib/composition-labels'
  import { codePage, marksOf, registryLabel } from '$lib/registries'
  import { COLLECTIONS, implicationClosure, tagLabels, tagLookup } from '$lib/tags'
  import { boxesOf, evidenceFile, pictureAlt } from '$lib/picture'
  import { CHECKS, readiness } from '$lib/readiness'
  import { parseSightingTypes, scriptName } from '$lib/scripts'
  import { snippet } from '$lib/seo'
  import { recordData } from '$lib/structured-data'
  import type { Sighting, StoredImage } from '$lib/server/entries'
  import { href, locale, media, t, day } from '$lib/t'
  import { recordCode, recordName } from '$lib/code'
  let { data, form } = $props()
  const entry = $derived(data.entry)
  const claims = $derived(data.claims)
  const editing = $derived(Boolean(form?.error && page.url.searchParams.has('/edit')))
  const commenting = $derived(Boolean(form?.error && page.url.searchParams.has('/comment')))
  const shownComments = $derived.by(() => { const shown = data.comments.filter(comment => !comment.hidden_at).length; return shown && (data.comments.length >= COMMENTS_SHOWN ? `${shown}+` : String(shown)) })
  const editValues = $derived(editing && form?.values && 'script' in form.values ? form.values : { ...entry, claims })
  let filled = $state<Fill | null>(null)
  let editOpen = $state(untrack(() => editing || data.idsAdd !== null))
  $effect(() => { if (editing) editOpen = true })
  let fields = $state<CharacterFields>()
  // The description groups on the page, so each one's report shows its own drawing.
  let formsShown = $state<HTMLElement[]>([])
  // The links to a field open the form and focus the field's first control; without scripts the browser
  // opens the form around the fragment target.
  async function edit(event: MouseEvent) {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-edit]')
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const field = link.dataset.edit!
    editOpen = true
    await tick()
    const target = document.getElementById(`edit-${field}`)
    if (!target) return
    if (target instanceof HTMLDetailsElement) {
      // The radical line and the line of encodings after it share `edit-identity`.
      target.open = true
      for (let line = target.nextElementSibling; line instanceof HTMLDetailsElement && line.classList.contains('fact'); line = line.nextElementSibling) line.open = true
    }
    history.replaceState(history.state, '', `#edit-${field}`)
    target.scrollIntoView({ block: 'center' })
    if (field === 'ids') fields?.focus()
    else target.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select')?.focus({ preventScroll: true })
  }
  // A spelling is added as a row under the descriptions in the form, to be saved there, or an empty row for a new one.
  async function addIds(value = '') {
    editOpen = true
    await tick()
    document.getElementById('edit-ids')?.scrollIntoView({ block: 'center' })
    await fields?.append(value)
  }
  function another(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    history.replaceState(history.state, '', '#edit-ids')
    addIds()
  }
  onMount(() => { if (data.idsAdd) addIds(data.idsAdd) })
  const editIds = $derived(valuesOf(editValues.claims, 'ids'))
  let primary = $state(untrack(() => editIds[0] ?? ''))
  const editComposition = $derived.by(() => { const found = compositionOf(editValues.claims); return found ? JSON.stringify(found) : '' })

  // Every description the record states, each with its own layout. Descriptions that spell the same
  // form share one set of drawings; only the ones that name another form get a set of their own.
  type Form = { ids: string; layout: string | null }
  const forms = $derived(idsForms(claims).map((form): Form => ({ ids: form.ids, layout: layoutText(form.layout) || null })))
  const sequences = $derived(forms.map(form => form.ids))
  // The table says which of those spellings are one form; until it answers, the first description draws alone.
  let grouped = $state.raw<(Form & { spellings: string[] })[] | null>(null)
  const groups = $derived(grouped ?? forms.slice(0, 1).map(form => ({ ...form, spellings: [form.ids] })))
  // The other spellings of the first description the table gives, as far as the record does not hold them.
  let spellings = $state.raw<string[]>([])
  $effect(() => {
    const first = sequences[0]
    spellings = []
    if (!first) return
    let live = true
    describedTable().then(table => { if (live) spellings = equivalentSpellings(first, table, 5, false).slice(1) }).catch(() => {})
    return () => { live = false }
  })
  $effect(() => {
    const held = forms
    if (held.length < 2) { grouped = held.map(form => ({ ...form, spellings: [form.ids] })); return }
    let live = true
    grouped = null
    describedTable()
      .then(table => { if (live) grouped = spellingGroups(held, table).map(group => ({ ...group[0], spellings: group.map(form => form.ids) })) })
      .catch(() => { if (live) grouped = held.map(form => ({ ...form, spellings: [form.ids] })) })
    return () => { live = false }
  })
  const others = $derived(spellings.filter(spelling => !sequences.some(held => cleanIds(held) === spelling)))
  const analysis = $derived(sequences[0] ? analyze(sequences[0], compositionOf(claims)) : null)
  const ivd = $derived(valuesOf(claims, 'ivd')[0] ?? null)
  const encodings = $derived(encodingsOf(claims))
  const recordLabel = $derived(`${recordCode(entry.id)} ${recordName(entry.id)}`)
  const unicode = $derived(encodings.find(encoding => encoding.charset === 'unicode'))
  const subject = $derived(entry.ids || (unicode && encodedCharacter(unicode.code)))
  const seoTitle = $derived(subject ? `${snippet(subject, 36)} · ${recordLabel}` : recordLabel)
  const seoDescription = $derived([
    t('entry.record', { id: recordLabel }),
    scriptName(locale(), entry.script, entry.script_other),
    entry.status && t(`status.${entry.status}`),
    entry.description || entry.cover_place,
  ].filter(Boolean).join(' · '))
  const cover = $derived(data.sightings.find(sighting => sighting.media.length)?.media[0])
  const sources = $derived(data.sightings.filter(sighting => sighting.source_id !== null).map(sighting => ({ ...sighting, id: sighting.source_id! })))
  const structured = $derived(recordData({ locale: locale(), id: entry.id, name: seoTitle, description: seoDescription, siteName: t('app.name'), image: cover && media(cover.image_key), sources }))
  const marks = $derived(marksOf(encodings))
  const tagsByName = $derived(tagLookup(data.tags))
  const labels = $derived(tagLabels(data.tags))
  const closure = $derived(implicationClosure(valuesOf(claims, 'tag'), data.tags))
  const collections = $derived(COLLECTIONS.filter(collection => valuesOf(claims, 'collection').includes(collection.slug)))
  const brief = (text: string) => [...text].length > 40 ? [...text].slice(0, 39).join('') + '…' : text
  const options = $derived(data.sightings.map(sighting => ({ token: String(sighting.id), value: String(sighting.id), label: `#${sighting.id} ${brief(sighting.place || sighting.title || sighting.url || '')}` })))
  const ready = $derived(readiness({ ids: entry.ids, radical: entry.radical, strokes: entry.strokes }, data.sightings))

  const sourceFields = [
    { key: 'author', label: 'field.author' },
    { key: 'title', label: 'field.title' },
    { key: 'container', label: 'field.container' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
    { key: 'original_date', label: 'field.originalDate' },
    { key: 'page', label: 'field.page' },
  ] as const
  const at = locale()

  let preparing = $state<string | null>(null)
  let favError = $state('')
  $effect(() => { void entry.id; favError = '' })
  async function download(sighting: Sighting, picture: StoredImage, position: number) {
    preparing = picture.image_key
    try {
      const file = await evidenceFile(media(picture.image_key), boxesOf(picture.box), `${recordCode(entry.id)}-${sighting.id}-${position + 1}`)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(file)
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } finally { preparing = null }
  }
</script>

<svelte:window onclick={edit} />
<Seo data={structured} title={seoTitle} description={seoDescription} image={href(`/entry/${entry.id}/card.png?v=${encodeURIComponent(entry.updated_at)}`)} imageAlt={seoTitle} />
<div class="page narrow stack">
  <div class="row"><a class="text-link back" href={href()}>← {t('nav.browse')}</a><a class="text-link" href={href(`/entry/${entry.id}/history`)}>{t('entry.history')}</a><a class="text-link" href="#discussion">{t('discussion.title')}{#if shownComments} <span class="count">{shownComments}</span>{/if}</a><a class="text-link" href={href(`/entry/${entry.id}/report`)}>{t('entry.report')}</a></div>
  <div class="heading"><div class="stack title"><h1><span class="code">{recordCode(entry.id)}</span> <span class="code-name" lang="zh-Hant">{recordName(entry.id)}</span></h1><div class="row"><span class="badge">{entry.script === 'other' && entry.script_other ? entry.script_other : t(`script.${entry.script}`)}</span>{#if entry.status}<span class="badge {entry.status}">{t(`status.${entry.status}`)}</span>{/if}{#if data.earliest}<a class="first-seen" href="#sighting-{data.earliest.sighting}" title={t(data.earliest.kind === 'original' ? 'field.originalDate' : 'field.reportDate')}>{t('entry.firstSeen', { year: data.earliest.year })}</a>{/if}</div></div><div class="row"><ShareRecord id={entry.id} /><FavouriteButton id={entry.id} initial={data.favourites.includes(entry.id)} onerror={message => favError = message} /></div></div>
  {#if favError}<p class="notice bad" role="alert">{favError}</p>{/if}
  {#if entry.hidden_at}<p class="notice bad">{t('entry.hidden')}</p>{/if}
  {#if entry.merged_into}<p class="notice quiet"><a class="text-link" href={href(`/entry/${entry.merged_into}`)}>{t('entry.mergedInto', { id: recordCode(entry.merged_into) })}</a></p>{/if}
  <section class="panel stack">
    <div class="head"><h2>{t('entry.about')}</h2><a class="button small" href="#edit-ids" data-edit="ids">{t('entry.edit')}</a></div>
    {#if sequences.length}
      <div class="identity">
        <ul class="forms">{#each groups as group, position (group.ids)}<li class="form" bind:this={formsShown[position]}><ul class="styles">{#each GLYPH_STYLES as style (style)}<li><GlyphFace {style}><IdsGlyph ids={group.ids} layout={group.layout} {style} /></GlyphFace></li>{/each}</ul><p class="sequence">{#each group.spellings as spelling, index (spelling)}<span class="ids" class:secondary={index > 0}>{spelling}</span><CopyButton text={spelling} />{/each}</p><SpellingReport record={entry.id} sequence={group.ids} layout={group.layout} drawing={style => formsShown[position]?.querySelector(`.styles > li:nth-child(${GLYPH_STYLES.indexOf(style) + 1}) svg`) ?? null} /></li>{/each}</ul>
        <EditLink field="ids" name={t('field.ids')} />
        <div class="others">
          {#each others as spelling (spelling)}<button type="button" class="alt" onclick={() => addIds(spelling)}><span class="ids-text">{spelling}</span><span class="alt-add">+ {t('entry.idsAlternateAdd')}</span></button>{/each}
          <a class="text-link small" href="#edit-ids" onclick={another}>+ {t('entry.idsAnother')}</a>
        </div>
      </div>
      <p class="sites">{#each descriptionLinks(sequences[0], at) as link}<a class="text-link small" href={link.href} target="_blank" rel="noopener">{link.name} ↗</a>{/each}</p>
    {:else}
      <p><EditLink field="ids" name={t('entry.addIds')} add /></p>
    {/if}
    {#if analysis?.tagged}
      <p class="formation"><span class="label">{t('field.formation')}</span><span class="method">{formationLabel(at, analysis.formation)}</span>{#each analysis.parts.filter(part => part.role) as part, index (index)}<span class="part">{part.part} · {roleLabel(at, part.role)}</span>{/each}</p>
    {/if}
    <div class="line">
      {#if entry.description}<p class="description">{entry.description}</p><EditLink field="description" name={t('field.description')} />
      {:else}<EditLink field="description" name={t('entry.addDescription')} add />{/if}
    </div>
    {#if closure.all.length || collections.length}
      <p class="chips">
        {#each closure.direct as value (value)}
          {@const info = tagsByName.get(value)}
          <a class="tag-chip" data-tag-type={info?.type ?? 'general'} href={href(`/?tag=${encodeURIComponent(value)}`)}>
            {info?.label ?? value}
          </a>
        {/each}
        {#each closure.implied as implied (implied.name)}
          {@const info = tagsByName.get(implied.name)}
          {@const viaNames = implied.via.map(v => labels.get(v) ?? v).join(', ')}
          <a
            class="tag-chip implied"
            data-tag-type={info?.type ?? 'general'}
            title={t('tags.carriedBy', { via: viaNames })}
            href={href(`/?tag=${encodeURIComponent(implied.name)}`)}
          >
            {info?.label ?? implied.name}
          </a>
        {/each}
        {#each collections as collection (collection.slug)}<a class="chip-link" href={href(`/?collection=${collection.slug}`)}>{collection.label}</a>{/each}
        <EditLink field="filing" name={t('field.filing')} />
      </p>
    {:else}
      <p><EditLink field="filing" name={t('entry.addCategory')} add /></p>
    {/if}
    <ul class="marks" aria-label={t('field.encodings')}>
      {#each marks as mark (mark.registry.id)}
        {@const name = t(`registry.${mark.registry.id}`)}
        {@const text = mark.code === null ? t('registry.out', { name }) : mark.since ? t('registry.since', { version: mark.since }) : t('registry.in', { name })}
        <li>{#if mark.href}<a class="badge encoded" href={mark.href} target="_blank" rel="noopener" title={mark.registry.label}>{text}</a>{:else}<span class="badge" class:encoded={mark.code !== null} title={mark.registry.label}>{text}</span>{/if}</li>
      {/each}
      <li><EditLink field="identity" name={t('field.encodings')} /></li>
    </ul>
    <dl class="facts">
      {#each encodings as encoding (encoding.charset + '|' + encoding.code)}
        {@const character = encoding.charset === 'unicode' ? encodedCharacter(encoding.code) : ''}
        {@const page = character ? null : codePage(encoding)}
        <div><dt>{registryLabel(encoding.charset)}</dt><dd>{#if character}<span class="character encoded">{character}</span><CopyButton text={character} /> {/if}{#if page}<a class="mono text-link" href={page} target="_blank" rel="noopener">{encoding.code} ↗</a>{:else}<span class="mono">{encoding.code}</span>{/if}{#if character}<span class="sites">{#each characterLinks(character, at) as link}<a class="text-link small" href={link.href} target="_blank" rel="noopener">{link.name} ↗</a>{/each}</span>{/if}</dd></div>
      {/each}
      {#if ivd}<div><dt>{t('field.ivd')}</dt><dd class:mono={ivd !== 'none'}>{ivd === 'none' ? t('field.ivdNone') : ivd}</dd></div>{/if}
      {#if data.filed.length}<div><dt>{t('field.radical')}<EditLink field="identity" name={t('field.radicalStrokes')} /></dt><dd class="radicals">{#each data.filed as radical, index (radical.path)}{#if index}<span class="muted" aria-hidden="true">›</span>{/if}<a class="character text-link" href={href(`?radical=${encodeURIComponent(radical.path)}`)}>{radical.radical}</a>{/each}</dd></div>{:else if entry.radical}<div><dt>{t('field.radical')}<EditLink field="identity" name={t('field.radicalStrokes')} /></dt><dd>{entry.radical}</dd></div>{:else}<div><dt>{t('field.radical')}</dt><dd><EditLink field="identity" name={t('entry.addRadical')} add /></dd></div>{/if}
      {#if entry.strokes != null}<div><dt>{t('field.strokes')}</dt><dd>{entry.strokes}</dd></div>{/if}
    </dl>
    <div class="senses">
      <SenseList {claims} sightings={data.sightings.map(sighting => sighting.id)} records={data.related} />
      {#if claims.some(claim => claim.kind === 'meaning' || claim.kind === 'reading' || claim.kind === 'relation')}<span class="pen"><EditLink field="senses" name={t('field.senses')} /></span>
      {:else}<EditLink field="senses" name={t('entry.addSenses')} add />{/if}
    </div>
    {#if entry.by_name && entry.created_at}<p class="hint">{t('entry.firstAdded', { name: entry.by_name, date: day(entry.created_at) })}</p>{/if}
  </section>
  <details class="panel" id="edit" bind:open={editOpen}>
    <summary>{t('entry.edit')}</summary>
    <form class="stack form" method="POST" action="?/edit">
      {#if editing}<p class="notice bad" role="alert">{t(`error.${form?.error}`)}</p>{/if}
      <input type="hidden" name="rev" value={entry.rev} />
      {#key `${entry.id}:${entry.rev}:${editing}`}
        <CharacterFields bind:this={fields} anchor="edit-ids" exclude={entry.id} values={editIds} layout={primaryLayoutOf(editValues.claims)} bind:primary onfill={facts => filled = facts}>
          <div class="sheet">
            <CompositionField ids={primary} value={editComposition} />
            <ScriptPicker value={editValues.script} other={editValues.script_other} />
            <IdentityFields anchor="edit-identity" claims={editValues.claims} radical={editValues.radical} strokes={editValues.strokes} fill={filled} ids={primary} />
          </div>
        </CharacterFields>
        <div class="field" id="edit-description"><label for="description">{t('field.description')}</label><textarea id="description" class="input" name="description">{editValues.description ?? ''}</textarea></div>
        <div id="edit-senses"><SenseEditor claims={editValues.claims} evidence={options} fill={filled} /></div>
        <details class="filing" id="edit-filing" open>
          <summary class="section-title">{t('field.filing')}</summary>
          <div class="stack filed"><TagFields tags={data.tags} selected={valuesOf(editValues.claims, 'tag')} collections={valuesOf(editValues.claims, 'collection')} /></div>
        </details>
      {/key}
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" /></div>
      {#if editing && form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar />{/if}
    </form>
  </details>
  {#if entry.status !== 'encoded'}
  <section class="panel stack">
    <h2>{t('ready.title')}</h2>
    <ul class="checks">{#each CHECKS as check}<li class:done={ready[check]}><span class="tick" aria-hidden="true">{ready[check] ? '✓' : '○'}</span>{t(`ready.${check}`)}</li>{/each}</ul>
    <a class="text-link small" href="https://www.unicode.org/irg/pp/" target="_blank" rel="noopener">{t('ready.rules')} ↗</a>
  </section>
  {/if}
  <section class="stack"><h2>{t('entry.sightings')}</h2>
    {#each data.sightings as sighting (sighting.id)}
      {@const types = parseSightingTypes(sighting.types)}
      <article class="panel stack" id="sighting-{sighting.id}">
        {#if sighting.media.length}
          <div class="pictures" class:single={sighting.media.length === 1}>
            {#each sighting.media as picture, position (picture.image_key)}
              <figure>
                <MarkedPicture {picture} alt={pictureAlt([subject, recordCode(entry.id), sighting.title, sighting.place], position, sighting.media.length)} />
                <figcaption><button class="button small" type="button" title={t('sighting.evidenceHint')} disabled={preparing === picture.image_key} onclick={() => download(sighting, picture, position)}>{t('sighting.evidence')}</button></figcaption>
              </figure>
            {/each}
          </div>
        {/if}
        {#if sighting.place}<h3>{sighting.place}</h3>{/if}
        {#if types.length || data.earliest?.sighting === sighting.id}<div class="row badges">{#if data.earliest?.sighting === sighting.id}<span class="badge earliest">{t('entry.earliest')}</span>{/if}{#each types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
        {#if sighting.url && /^https?:\/\//i.test(sighting.url)}<a class="text-link url" href={sighting.url} target="_blank" rel="noopener noreferrer">{sighting.url} ↗</a>{/if}
        {#if sighting.vias.length}<ViaChain vias={sighting.vias} dates={data.dates} />{/if}
        <dl class="facts">{#each sourceFields as field}{#if sighting[field.key]}<div><dt>{t(field.label)}</dt><dd>{#if field.key === 'report_date' || field.key === 'original_date'}<EvidenceDate text={sighting[field.key]} reading={data.dates.get(sighting[field.key] ?? '')} />{:else}{sighting[field.key]}{/if}</dd></div>{/if}{/each}
          {#if sighting.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${sighting.context}`)}</dd></div>{/if}
          {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
        </dl>
        <SourceQuotations quotes={sighting.quotes} url={sighting.url} />
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
          <a class="text-link small" href="{href(`/entry/${entry.id}?about=${sighting.id}`)}#discussion">{t('sighting.discuss')}</a>
          <a class="text-link small" href={href(`/entry/${entry.id}/report?sighting=${sighting.id}`)}>{t('entry.report')}</a>
        </div>
      </article>
    {/each}
    <div class="row"><a class="button primary" href={href(`/entry/${entry.id}/sighting/new`)}>{t('entry.addSighting')}</a></div>
  </section>
  {#if data.related.length}<section class="stack" id="related"><h2>{t('entry.related')}</h2><RelatedRecords records={data.related} /></section>{/if}
  <Discussion entry={entry.id} comments={data.comments} sightings={data.sightings.map(sighting => sighting.id)} about={commenting && form && 'about' in form ? form.about : data.about} moderator={Boolean(data.person?.moderator)} error={commenting ? form?.error : null} draft={commenting && form && 'comment' in form ? form.comment : ''} />
</div>
<style>
  .heading { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:12px 16px }
  .head { display:flex; align-items:center; justify-content:space-between; gap:12px }
  .line { display:flex; align-items:flex-start; gap:6px } .line .description { margin:0; min-width:0 }
  .senses { position:relative; display:flex; flex-direction:column; gap:8px } .senses > .pen { position:absolute; inset-block-start:-2px; inset-inline-end:0 }
  dt :global(.pencil) { margin-inline-start:4px; vertical-align:-6px }
  summary { cursor:pointer; font-weight:600 } .form { margin-top:18px }
  .sheet { display:flex; flex-direction:column; gap:10px; padding-top:10px; border-top:1px dashed var(--line) } .filed { margin-top:14px }
  .count { font-variant-numeric:tabular-nums; color:var(--muted) }
  .back { align-self:start; color:var(--muted) } .title { gap:8px } .code { font-variant-numeric:tabular-nums } .code-name { margin-inline-start:6px; font-weight:400; color:var(--muted) } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  h3 { font-size:14px; font-weight:600 }
  .identity { display:flex; flex-wrap:wrap; align-items:center; gap:12px 18px; min-width:0 }
  /* The description drawn in each style the site composes, side by side, in place of one plate. */
  .forms { display:flex; flex-wrap:wrap; align-items:flex-start; gap:14px 22px; min-width:0; margin:0; padding:0; list-style:none }
  .form { display:flex; flex-direction:column; gap:6px; min-width:0 }
  .styles { --face-size:96px; display:flex; flex-wrap:wrap; gap:10px; margin:0; padding:0; list-style:none }
  .sequence { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; margin:0; font-size:22px; line-height:1.35 }
  .form + .form .sequence { font-size:16px; color:var(--muted) }
  .sequence .secondary { font-size:16px; color:var(--muted) }
  .form :global(.report) { align-self:flex-start }
  .sites { display:flex; flex-wrap:wrap; gap:4px 12px; margin:0 } dd .sites { margin-top:4px }
  .others { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; min-width:0 }
  .alt { display:inline-flex; align-items:center; gap:8px; max-width:100%; padding:2px 10px; border:1px solid var(--line); border-radius:999px; background:none; font:inherit; font-size:13px; color:var(--ink); cursor:pointer }
  .alt:hover, .alt:focus-visible { border-color:var(--accent); color:var(--accent) }
  .ids-text { overflow-wrap:anywhere } .alt-add { flex:none; color:var(--muted) } .alt:hover .alt-add { color:inherit }
  .formation { display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px } .formation .label { color:var(--muted); font-size:12px; font-weight:400 }
  .method { font-weight:600 } .part { padding:1px 8px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:12.5px }
  .description { white-space:pre-wrap; overflow-wrap:anywhere } .badges { gap:6px }
  .chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px } .chip-link { padding:2px 10px; border:1px solid var(--line); border-radius:999px; font-size:13px } .chip-link:hover { border-color:var(--accent); color:var(--accent) } .chips .tag-chip:hover { filter: brightness(0.95) }
  .marks { display:flex; flex-wrap:wrap; gap:6px; margin:0; padding:0; list-style:none } .marks a:hover { text-decoration:underline }
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr)); gap:12px; margin:0 } .facts:empty { display:none }
  dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .radicals { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px }
  .character { font-size:20px; line-height:1.3 } .character.encoded { font-family:inherit; vertical-align:middle }
  .supports { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; margin:0; min-width:0 }
  .supported { display:inline-flex; align-items:baseline; gap:6px; min-width:0; max-width:100%; padding:1px 9px; border:1px solid var(--line); border-radius:999px; font-size:12.5px } .supported:hover { border-color:var(--accent); color:var(--accent) }
  .supported .kind { flex:none; color:var(--muted); font-size:11.5px } .supported .text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
  article:target { outline:2px solid var(--accent); outline-offset:2px } article { scroll-margin-block:16px }
  .checks { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr)); gap:6px 16px; margin:0; padding:0; list-style:none; color:var(--muted) }
  .checks li { display:flex; gap:8px } .checks li.done { color:var(--ink) } .checks li.done .tick { color:var(--good) } .tick { flex:none; width:1em; text-align:center }
  .pictures { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr)); gap:12px } .pictures.single { grid-template-columns:minmax(0,1fr) }
  figure { display:flex; flex-direction:column; gap:6px; margin:0; min-width:0 }
  .pictures:not(.single) { --picture-height: 260px }
  .button.small { min-height:32px; padding:4px 10px; font-size:12.5px }
  .url { overflow-wrap:anywhere }
  @media(max-width:700px) { .panel { padding:16px } .styles { --face-size:64px; gap:8px } }
  .first-seen { align-self:center; font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; text-decoration:underline; text-decoration-color:var(--line-strong); text-underline-offset:3px }
  .first-seen:hover { color:var(--ink) }
  .badge.earliest { background:var(--accent-light); color:var(--accent) }
</style>
