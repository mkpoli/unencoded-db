<script lang="ts">
  // A past version of a record or a sighting, as it read then. A record's claims are listed by kind, each
  // with the claims it held under and the sightings it rested on.
  import { doculectKey } from '$lib/doculects'
  import { CLAIM_KINDS, claimsOf, compositionOf, scopesOf, type Claim, type ClaimKind } from '$lib/claims'
  import { analyze } from '$lib/composition'
  import { formationLabel, roleLabel } from '$lib/composition-labels'
  import { encodingSetLabel } from '$lib/encodings'
  import { COLLECTIONS, genreOf } from '$lib/genres'
  import { parseSightingTypes } from '$lib/scripts'
  import type { EntryFields, SightingFields } from '$lib/server/entries'
  import { locale, t } from '$lib/t'
  let { fields, sighting = false }: { fields: EntryFields | SightingFields; sighting?: boolean } = $props()
  const sourceFields = [
    { key: 'title', label: 'field.title' },
    { key: 'author', label: 'field.author' },
    { key: 'publisher', label: 'field.publisher' },
    { key: 'report_date', label: 'field.reportDate' },
    { key: 'original_date', label: 'field.originalDate' },
    { key: 'page', label: 'field.page' },
  ] as const
  const KIND_LABELS: Record<ClaimKind, `${string}.${string}`> = {
    ids: 'field.ids', composition: 'field.formation', reading: 'field.reading', meaning: 'field.meaning', encoding: 'field.encodings',
    relation: 'field.relatedCharacters', ivd: 'field.ivd', genre: 'field.genre', collection: 'field.collection', tag: 'field.tags',
  }
  const WIDE: ClaimKind[] = ['reading', 'meaning', 'relation', 'composition']
  const at = locale()

  function shown(claim: Claim, claims: Claim[]): string {
    switch (claim.kind) {
      case 'encoding': return `${encodingSetLabel(String(claim.data?.charset ?? ''))} ${claim.value}`
      case 'ivd': return claim.value === 'none' ? t('field.ivdNone') : claim.value
      case 'genre': return genreOf(claim.value)?.label ?? claim.value
      case 'collection': return COLLECTIONS.find(item => item.slug === claim.value)?.label ?? claim.value
      case 'tag': return `#${claim.value}`
      case 'reading': { const doculect = typeof claim.data?.doculect === 'string' ? claim.data.doculect : ''; const key = doculectKey(doculect); return doculect ? `${key ? t(key) : doculect} ${claim.value}` : claim.value }
      case 'composition': {
        const analysis = analyze(claim.value, compositionOf(claims))
        return analysis ? [formationLabel(at, analysis.formation), ...analysis.parts.filter(part => part.role).map(part => `${part.part} · ${roleLabel(at, part.role)}`)].join(', ') : claim.value
      }
      default: return claim.value
    }
  }
</script>

{#snippet scopes(claim: Claim, claims: Claim[])}{#each scopesOf(claims, claim) as scope (scope.key)}<span class="scope"><span class="kind">{t(KIND_LABELS[scope.kind])}</span><span class="text">{shown(scope, claims)}</span></span>{/each}{/snippet}
{#snippet bases(claim: Claim)}{#each claim.sightings as id (id)}<span class="basis">#{id}</span>{/each}{/snippet}

{#if sighting}
  {@const source = fields as SightingFields}
  {@const types = parseSightingTypes(source.types)}
  <div class="snapshot">
    <div class="source-head">
      {#if source.place}<h3>{source.place}</h3>{/if}
      {#if source.url}<a class="text-link url" href={source.url} target="_blank" rel="noopener noreferrer">{source.url} ↗</a>{/if}
    </div>
    <dl class="facts">
      {#each sourceFields as field}{#if source[field.key]}<div><dt>{t(field.label)}</dt><dd>{source[field.key]}</dd></div>{/if}{/each}
      {#if source.context}<div><dt>{t('field.context')}</dt><dd>{t(`context.${source.context}`)}</dd></div>{/if}
      {#if source.style}<div><dt>{t('field.style')}</dt><dd>{t(`style.${source.style}`)}</dd></div>{/if}
      {#if types.length}<div><dt>{t('field.sourceTypes')}</dt><dd>{types.map(type => t(`evidence.type.${type}`)).join(' · ')}</dd></div>{/if}
      {#if source.via_url || source.via_title || source.via_author || source.via_publisher || source.via_report_date}<div class="wide"><dt>{t('field.via')}</dt><dd>{[source.via_title, source.via_author, source.via_publisher, source.via_report_date, source.via_url].filter(Boolean).join(' · ')}</dd></div>{/if}
    </dl>
    {#if source.note}<p class="description">{source.note}</p>{/if}
  </div>
{:else}
  {@const entry = fields as EntryFields}
  <div class="snapshot">
    <div class="row">
      <span class="badge">{entry.script === 'other' && entry.script_other ? entry.script_other : t(`script.${entry.script}`)}</span>
      <span class="badge {entry.status}">{t(`status.${entry.status}`)}</span>
    </div>
    <p class:muted={!entry.description} class="description">{entry.description || t('entry.noDescription')}</p>
    <dl class="facts">
      {#if entry.radical}<div><dt>{t('field.radical')}</dt><dd>{entry.radical}</dd></div>{/if}
      {#if entry.strokes != null}<div><dt>{t('field.strokes')}</dt><dd>{entry.strokes}</dd></div>{/if}
      {#each CLAIM_KINDS.filter(kind => kind !== 'relation') as kind}
        {@const items = claimsOf(entry.claims, kind)}
        {#if items.length}
          <div class:wide={WIDE.includes(kind)}><dt>{t(KIND_LABELS[kind])}</dt><dd><ul class="claims" class:ids={kind === 'ids'}>{#each items as claim (claim.key)}<li>{shown(claim, entry.claims)}{@render scopes(claim, entry.claims)}{@render bases(claim)}</li>{/each}</ul></dd></div>
        {/if}
      {/each}
    </dl>
    {#if claimsOf(entry.claims, 'relation').length}
      <h3>{t('field.relatedCharacters')}</h3>
      <div class="relations">
        {#each claimsOf(entry.claims, 'relation') as relation}
          <dl class="facts relation">
            <div><dt>{t('field.relatedCharacter')}</dt><dd class="relation-character">{relation.value}</dd></div>
            <div><dt>{t('field.relatedRelationship')}</dt><dd class="linked">{t(`relationship.${String(relation.data?.relationship ?? '')}`)}{@render scopes(relation, entry.claims)}</dd></div>
            {#if relation.sightings.length}<div><dt>{t('field.basis')}</dt><dd class="linked">{@render bases(relation)}</dd></div>{/if}
            {#if relation.data?.difference}<div class="wide"><dt>{t('field.relatedDifference')}</dt><dd>{relation.data.difference}</dd></div>{/if}
            {#if relation.data?.evidence}<div class="wide"><dt>{t('field.relatedEvidence')}</dt><dd>{relation.data.evidence}</dd></div>{/if}
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
  .description { max-width: 75ch; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6 }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px 20px; margin: 0 }
  .facts:empty { display: none }
  dt { color: var(--muted); font-size: 11px }
  dd { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere }
  .wide { grid-column: 1 / -1 }
  .claims { margin: 0; padding: 0; list-style: none }
  .claims.ids li:first-child { font-size: 20px; line-height: 1.35 }
  h3 { font-size: 13px; font-weight: 600; color: var(--muted) }
  .relations { display: flex; flex-direction: column; gap: 10px }
  .relation { grid-template-columns: 1fr; padding: 12px 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface) }
  .relation-character { font-size: 20px }
  .claims li, .linked { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px }
  .scope { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%; padding: 1px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12.5px }
  .scope .kind { flex: none; color: var(--muted); font-size: 11.5px }
  .scope .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .basis { color: var(--muted); font-size: 11.5px; white-space: nowrap }
  .url { font-size: 12.5px; overflow-wrap: anywhere }
</style>
