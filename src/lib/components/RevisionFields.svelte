<script lang="ts">
  import { parseRelatedCharacters } from '$lib/related'
  import { parseSightingTypes } from '$lib/scripts'
  import type { EntryFields, SightingFields } from '$lib/server/entries'
  import { t } from '$lib/t'
  let { fields, sighting = false }: { fields: EntryFields | SightingFields; sighting?: boolean } = $props()
  const sourceFields = [
    { key: 'title', label: 'field.title' },
    { key: 'author', label: 'field.author' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
    { key: 'original_date', label: 'field.originalDate' },
    { key: 'page', label: 'field.page' },
  ] as const
  const entryFields = [
    { key: 'encoded_as', label: 'field.encodedAs' },
    { key: 'reading', label: 'field.reading' },
    { key: 'meaning', label: 'field.meaning' },
    { key: 'radical', label: 'field.radical' },
    { key: 'strokes', label: 'field.strokes' },
    { key: 'related', label: 'field.related' },
  ] as const
  const relationLabels = { variant: 'Variant', not_variant: 'Not a variant', similar: 'Similar', uncertain: 'Uncertain' }
  const label = (key: `${string}.${string}`, fallback: string) => { const text = t(key); return text === key ? fallback : text }
</script>

{#if sighting}
  {@const source = fields as SightingFields}
  {@const types = parseSightingTypes(source.types)}
  <div class="snapshot">
    <div class="source-head">
      <h3>{source.place || t('field.place')}</h3>
      {#if source.url}<a class="text-link url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url} ↗</a>{/if}
    </div>
    <dl class="facts">
      {#each sourceFields as field}{#if source[field.key]}<div><dt>{t(field.label)}</dt><dd>{source[field.key]}</dd></div>{/if}{/each}
      {#if source.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${source.context}`)}</dd></div>{/if}
      {#if source.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${source.style}`)}</dd></div>{/if}
      {#if types.length}<div><dt>{t('field.sourceTypes')}</dt><dd>{types.map(type => t(`evidence.type.${type}`)).join(' · ')}</dd></div>{/if}
    </dl>
    {#if source.note}<p class="description">{source.note}</p>{/if}
  </div>
{:else}
  {@const entry = fields as EntryFields}
  {@const relations = parseRelatedCharacters(entry.related_characters)}
  <div class="snapshot">
    <div class="row">
      <span class="badge">{entry.script === 'other' && entry.script_other ? entry.script_other : t(`script.${entry.script}`)}</span>
      <span class="badge {entry.status}">{t(`status.${entry.status}`)}</span>
    </div>
    {#if entry.ids}<p class="ids sequence">{entry.ids}</p>{/if}
    <p class:muted={!entry.description} class="description">{entry.description || t('entry.noDescription')}</p>
    <dl class="facts">
      {#each entryFields as field}
        {#if entry[field.key] != null && entry[field.key] !== ''}
          <div class:wide={field.key === 'meaning' || field.key === 'related'}><dt>{t(field.label)}</dt><dd>{entry[field.key]}</dd></div>
        {/if}
      {/each}
    </dl>
    {#if relations.length}
      <h3>{t('field.relatedCharacters')}</h3>
      <div class="relations">
        {#each relations as relation}
          <dl class="facts relation">
            <div><dt>{t('field.relatedCharacter')}</dt><dd class="relation-character">{relation.character}</dd></div>
            <div><dt>{t('field.relatedRelationship')}</dt><dd>{label(`relationship.${relation.relationship}`, relationLabels[relation.relationship])}</dd></div>
            {#if relation.difference}<div class="wide"><dt>{t('field.relatedDifference')}</dt><dd>{relation.difference}</dd></div>{/if}
            {#if relation.evidence}<div class="wide"><dt>{t('field.relatedEvidence')}</dt><dd>{relation.evidence}</dd></div>{/if}
          </dl>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .snapshot { display: flex; flex-direction: column; gap: 14px; min-width: 0 }
  .source-head { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
  .source-head h3 { font-size: 16px; font-weight: 600 }
  .ids { font-size: 24px; line-height: 1.35 }
  .description { max-width: 75ch; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6 }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px 20px; margin: 0 }
  .facts:empty { display: none }
  dt { color: var(--muted); font-size: 11px }
  dd { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere }
  .wide { grid-column: 1 / -1 }
  h3 { font-size: 13px; font-weight: 600; color: var(--muted) }
  .relations { display: flex; flex-direction: column; gap: 10px }
  .relation { grid-template-columns: 1fr; padding: 12px 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface) }
  .relation-character { font-size: 20px }
  .url { font-size: 12.5px; overflow-wrap: anywhere }
</style>
