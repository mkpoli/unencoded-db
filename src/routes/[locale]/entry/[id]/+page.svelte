<script lang="ts">
  import { page } from '$app/state'
  import Seo from '$lib/components/Seo.svelte'
  import ScriptPicker from '$lib/components/ScriptPicker.svelte'
  import IdsField from '$lib/components/IdsField.svelte'
  import SubmitBar from '$lib/components/SubmitBar.svelte'
  import RelatedCharacters from '$lib/components/RelatedCharacters.svelte'
  import { parseRelatedCharacters } from '$lib/related'
  import { STATUSES, parseSightingTypes } from '$lib/scripts'
  import { href, media, t, day } from '$lib/t'
  let { data, form } = $props()
  const entry = $derived(data.entry)
  const editing = $derived(Boolean(form?.error && page.url.searchParams.has('/edit')))
  const editValues = $derived(editing && form?.values && 'script' in form.values ? form.values : entry)
  let ids = $derived.by(() => {
    entry.id
    return editValues?.ids ?? ''
  })
  const fields = ['reading', 'meaning', 'radical', 'strokes', 'related'] as const
  const sourceFields = [
    { key: 'author', label: 'field.author' },
    { key: 'title', label: 'field.title' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
    { key: 'original_date', label: 'field.originalDate' },
    { key: 'page', label: 'field.page' },
  ] as const
  const label = (key: `${string}.${string}`, fallback: string) => { const text = t(key); return text === key ? fallback : text }
  const relationLabels = { variant: 'Variant', not_variant: 'Not a variant', similar: 'Similar', uncertain: 'Uncertain' }
</script>

<Seo title={t('entry.record', { id: entry.id })} image={entry.cover_key ? media(entry.cover_key) : null} />
<div class="page narrow stack">
  <div class="row"><a class="text-link back" href={href()}>← {t('nav.browse')}</a><a class="text-link" href={href(`/entry/${entry.id}/history`)}>{t('entry.history')}</a><a class="text-link" href={href(`/entry/${entry.id}/report`)}>{t('entry.report')}</a></div>
  <div class="heading"><div class="stack title"><h1>{t('entry.record', { id: entry.id })}</h1><div class="row"><span class="badge">{entry.script === 'other' && entry.script_other ? entry.script_other : t(`script.${entry.script}`)}</span><span class="badge {entry.status}">{t(`status.${entry.status}`)}</span></div></div></div>
  {#if entry.hidden_at}<p class="notice bad">{t('entry.hidden')}</p>{/if}
  {#if entry.merged_into}<p class="notice quiet"><a class="text-link" href={href(`/entry/${entry.merged_into}`)}>{t('entry.mergedInto', { id: entry.merged_into })}</a></p>{/if}
  <section class="panel stack">
    <h2>{t('entry.about')}</h2>
    {#if entry.ids}<p class="ids sequence">{entry.ids}</p>{/if}
    <p class:muted={!entry.description} class="description">{entry.description || t('entry.noDescription')}</p>
    <dl class="facts">
      {#if entry.encoded_as}<div><dt>{t('field.encodedAs')}</dt><dd>{entry.encoded_as}</dd></div>{/if}
      {#each fields as field}{#if entry[field] != null && entry[field] !== ''}<div><dt>{t(`field.${field}`)}</dt><dd>{entry[field]}</dd></div>{/if}{/each}
    </dl>
    {#if entry.related_characters}
      <h3>{label('field.relatedCharacters', 'Related characters')}</h3>
      {#each parseRelatedCharacters(entry.related_characters) as relation}
        <dl class="facts">
          <div><dt>{label('field.relatedCharacter', 'Related character')}</dt><dd>{relation.character}</dd></div>
          <div><dt>{label('field.relatedRelationship', 'Relationship')}</dt><dd>{label(`relationship.${relation.relationship}`, relationLabels[relation.relationship])}</dd></div>
          {#if relation.difference}<div><dt>{label('field.relatedDifference', 'Differences')}</dt><dd class="description">{relation.difference}</dd></div>{/if}
          {#if relation.evidence}<div><dt>{label('field.relatedEvidence', 'Evidence or source')}</dt><dd class="description">{relation.evidence}</dd></div>{/if}
        </dl>
      {/each}
    {/if}
    {#if entry.by_name && entry.created_at}<p class="hint">{t('entry.firstAdded', { name: entry.by_name, date: day(entry.created_at) })}</p>{/if}
  </section>
  <details class="panel" open={editing}>
    <summary>{t('entry.edit')}</summary>
    <form class="stack form" method="POST" action="?/edit">
      {#if editing}<p class="notice bad" role="alert">{form?.error === 'relatedCharacters' ? label('error.relatedCharacters', 'Check each comparison and use at most 50. Character, relationship, differences and evidence must fit their limits.') : t(`error.${form?.error}`)}</p>{/if}
      <input type="hidden" name="rev" value={entry.rev} />
      {#key entry.id}<ScriptPicker value={editValues?.script} other={editValues?.script_other} />{/key}
      <IdsField bind:value={ids} />
      <div class="field"><label for="description">{t('field.description')}</label><textarea id="description" class="input" name="description">{editValues?.description ?? ''}</textarea></div>
      <div class="field"><label for="status">{t('field.status')}</label><select id="status" class="input" name="status" value={editValues?.status ?? 'unchecked'}>{#each STATUSES as status}<option value={status}>{t(`status.${status}`)}</option>{/each}</select><p class="hint">{t('field.statusHint')}</p></div>
      <div class="grid-2">
        <div class="field"><label for="encoded_as">{t('field.encodedAs')}</label><input id="encoded_as" class="input" name="encoded_as" value={editValues?.encoded_as ?? ''} /></div>
        {#each fields as field}<div class="field"><label for={field}>{t(`field.${field}`)}</label><input id={field} class="input" name={field} type={field === 'strokes' ? 'number' : 'text'} min={field === 'strokes' ? 0 : undefined} max={field === 'strokes' ? 199 : undefined} value={editValues?.[field] ?? ''} /></div>{/each}
      </div>
      {#key `${entry.id}:${editValues?.related_characters ?? ''}`}<RelatedCharacters value={editValues?.related_characters} />{/key}
      <div class="field"><label for="summary">{t('form.summary')}</label><input id="summary" class="input" name="summary" maxlength="500" /></div>
      {#if editing && form?.error === 'conflict'}<button class="button" type="submit" disabled>{t('form.save')}</button>{:else}<SubmitBar />{/if}
    </form>
  </details>
  <section class="stack"><h2>{t('entry.sightings')}</h2>
    {#each data.sightings as sighting (sighting.id)}
      {@const types = parseSightingTypes(sighting.types)}
      <article class="panel stack">
        {#if sighting.hidden_at}<p class="notice quiet">{t('sighting.hidden')}</p>{:else}
          {#if sighting.image_key}<a class="image" href={media(sighting.image_key)}><img src={media(sighting.image_key)} alt={sighting.place || t('field.image')} loading="lazy" /></a>{/if}
          <h3>{sighting.place}</h3>
          {#if types.length}<div class="row badges">{#each types as type}<span class="badge">{t(`evidence.type.${type}`)}</span>{/each}</div>{/if}
          {#if sighting.url && /^https?:\/\//i.test(sighting.url)}<a class="text-link url" href={sighting.url} target="_blank" rel="noopener noreferrer">{sighting.url} ↗</a>{/if}
          <dl class="facts">{#each sourceFields as field}{#if sighting[field.key]}<div><dt>{t(field.label)}</dt><dd>{sighting[field.key]}</dd></div>{/if}{/each}
            {#if sighting.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${sighting.context}`)}</dd></div>{/if}
            {#if sighting.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${sighting.style}`)}</dd></div>{/if}
          </dl>
          {#if sighting.note}<p class="description">{sighting.note}</p>{/if}
          {#if sighting.by_name}<p class="hint">{t('sighting.by', { name: sighting.by_name })}</p>{/if}
          <div class="row"><a class="text-link small" href={href(`/entry/${entry.id}/sighting/${sighting.id}/edit`)}>{t('sighting.edit')}</a><a class="text-link small" href={href(`/entry/${entry.id}/report?sighting=${sighting.id}`)}>{t('entry.report')}</a></div>
        {/if}
      </article>
    {/each}
    <div class="row"><a class="button primary" href={href(`/entry/${entry.id}/sighting/new`)}>{t('entry.addSighting')}</a></div>
  </section>
</div>
<style>
  summary { cursor:pointer; font-weight:600 } .form { margin-top:18px }
  .back { align-self:start; color:var(--muted) } .title { gap:8px } .panel { padding:20px; border:1px solid var(--line); border-radius:10px; background:var(--surface) }
  .sequence { font-size:30px } .description { white-space:pre-wrap; overflow-wrap:anywhere } .badges { gap:6px }
  .facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(145px,1fr)); gap:12px; margin:0 } .facts:empty { display:none } dt { color:var(--muted); font-size:12px } dd { margin:2px 0 0; overflow-wrap:anywhere }
  .image { display:flex; justify-content:center; background:var(--surface-sunken); border-radius:6px; overflow:hidden } .image img { display:block; max-width:100%; max-height:65vh; object-fit:contain } .url { overflow-wrap:anywhere }
  @media(max-width:700px) { .panel { padding:16px } }
</style>
