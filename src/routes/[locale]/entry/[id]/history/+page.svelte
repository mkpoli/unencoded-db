<script lang="ts">
  import Seo from '$lib/components/Seo.svelte'
  import { href, t, when } from '$lib/t'
  import { parseRelatedCharacters } from '$lib/related'
  const label = (key: `${string}.${string}`, fallback: string) => { const text = t(key); return text === key ? fallback : text }
  const relationLabels = { variant: 'Variant', not_variant: 'Not a variant', similar: 'Similar', uncertain: 'Uncertain' }
  let { data, form } = $props()
  const labels: Record<string, string> = { script: 'script', script_other: 'scriptOther', ids: 'ids', description: 'description', status: 'status', encoded_as: 'encodedAs', related: 'related', related_characters: 'related', reading: 'reading', meaning: 'meaning', radical: 'radical', strokes: 'strokes', place: 'place', url: 'url', title: 'title', author: 'author', publisher: 'publisher', report_date: 'reportDate', original_date: 'originalDate', page: 'page', context: 'context', style: 'style', types: 'sourceTypes', note: 'note' }
</script>

<Seo title={t('history.title', { id: data.id })} />
<div class="page narrow stack">
  <a class="text-link back" href={href(`/entry/${data.id}`)}>← {t('history.back')}</a>
  <h1>{t('history.title', { id: data.id })}</h1>
  {#if form?.error}<p role="alert">{t(`error.${form.error}`)}</p>{/if}
  {#if !data.rows.length}<p class="muted">{t('recent.empty')}</p>{/if}
  <ol class="changes">
    {#each data.rows as row (row.id)}
      <li>
        <div>{t(`history.kind.${row.kind}`)}{#if row.sighting_id} · #{row.sighting_id}{/if}{#if row.rev} · r{row.rev}{/if}</div>
        <div class="muted small">{#if row.by_name}{row.by_name} · {/if}<time datetime={row.at}>{when(row.at)}</time></div>
        {#if row.summary}<p>{row.summary}</p>{/if}
        {#if row.fields}
          <dl>
            {#each Object.entries(row.fields) as [field, value]}
              {#if field === 'related_characters'}
                <div><dt>{label('field.relatedCharacters', 'Related characters')}</dt><dd>{#each parseRelatedCharacters(value as string | null) as relation}<p>{relation.character} · {label(`relationship.${relation.relationship}`, relationLabels[relation.relationship])}{#if relation.difference}<br />{label('field.relatedDifference', 'Differences')}: {relation.difference}{/if}{#if relation.evidence}<br />{label('field.relatedEvidence', 'Evidence or source')}: {relation.evidence}{/if}</p>{:else}—{/each}</dd></div>
              {:else}
                <div><dt>{t(`field.${labels[field]}`)}</dt><dd>{value == null || value === '' ? '—' : field === 'script' || field === 'status' ? t(`${field}.${value}`) : value}</dd></div>
              {/if}
            {/each}
          </dl>
          <form method="POST" action="?/restore">
            <input type="hidden" name="revision" value={row.id} />
            <input type="hidden" name="rev" value={data.rev} />
            <button class="button" type="submit">{t('history.restore')}</button>
          </form>
        {/if}
        {#if row.sightingFields}
          <dl>
            {#each Object.entries(row.sightingFields) as [field, value]}
              <div><dt>{t(`field.${labels[field]}`)}</dt><dd>{value == null || value === '' ? '—' : field === 'context' || field === 'style' ? t(`${field}.${value}`) : value}</dd></div>
            {/each}
          </dl>
          <form method="POST" action="?/restore">
            <input type="hidden" name="revision" value={row.id} />
            <input type="hidden" name="sighting" value={row.sighting_id} />
            <input type="hidden" name="rev" value={row.sightingRev} />
            <button class="button" type="submit">{t('history.restoreSighting')}</button>
          </form>
        {/if}
      </li>
    {/each}
  </ol>
  {#if data.next}<div><a class="button" href="?before={data.next}">{t('recent.older')}</a></div>{/if}
</div>

<style>
  .back { align-self: start; color: var(--muted) }
  .changes { list-style: none; padding: 0; margin: 0 }
  .changes li { padding: 12px 0; border-bottom: 1px solid var(--line) }
  .changes p, dd { white-space: pre-wrap; overflow-wrap: anywhere }
  dl > div { display: grid; grid-template-columns: minmax(8rem, 1fr) 2fr; gap: 1rem; padding: 0.2rem 0 }
  dt { color: var(--muted) }
  dd { margin: 0 }
</style>
