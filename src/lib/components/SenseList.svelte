<script lang="ts">
  // What a record says its character means, how it is read and which characters it is related to, read
  // from either side: a meaning shows the readings and related characters that hold under it, and a
  // related character shows the meanings and readings it holds under. A reading under no meaning is
  // listed by itself. Each claim is the target of `#claim-<key>`, and names the sightings it rests on.
  import { claimsOf, claimsUnder, scopesOf, type Claim } from '$lib/claims'
  import { claimLabel, doculectName } from '$lib/claim-label'
  import { t } from '$lib/t'
  import CopyButton from './CopyButton.svelte'

  // `sightings` are the ids the page shows, so that a claim links only to evidence that is on it.
  let { claims, sightings }: { claims: Claim[]; sightings: number[] } = $props()

  const meanings = $derived(claimsOf(claims, 'meaning'))
  const readings = $derived(claimsOf(claims, 'reading'))
  const relations = $derived(claimsOf(claims, 'relation'))
  const general = $derived(readings.filter(reading => !meanings.some(meaning => reading.under.includes(meaning.key))))
  // A reading under several meanings is shown with each, and is the link's target where it is shown first.
  // A related character under a reading stands beside it, unless the meaning it is shown with lists it.
  const home = $derived(new Map(readings.map(reading => [reading.key, meanings.find(meaning => reading.under.includes(meaning.key))?.key])))
  const doculect = (claim: Claim) => typeof claim.data?.doculect === 'string' ? claim.data.doculect : ''
</script>

{#snippet basis(claim: Claim)}{@const shown = claim.sightings.filter(id => sightings.includes(id))}{#if shown.length}<span class="bases">{#each shown as id (id)}<a class="basis" href="#sighting-{id}">#{id}</a>{/each}</span>{/if}{/snippet}
{#snippet related(relation: Claim)}<a class="related" href="#claim-{relation.key}"><span class="character">{relation.value}</span>{t(`relationship.${String(relation.data?.relationship)}`)}</a>{/snippet}
{#snippet read(reading: Claim, target: boolean, listed: Claim[] = [])}
  <li class="claim" id={target ? `claim-${reading.key}` : undefined}>
    {#if doculect(reading)}<span class="badge doculect" title={doculect(reading)}>{doculectName(doculect(reading))}</span>{/if}<span class="reading">{reading.value}</span>{@render basis(reading)}
    {#each claimsUnder(claims, reading.key).filter(relation => !listed.includes(relation)) as relation (relation.key)}{@render related(relation)}{/each}
  </li>
{/snippet}

{#if meanings.length}
  <section class="block">
    <h3>{t('field.meaning')}</h3>
    <ol class="senses" class:numbered={meanings.length > 1}>
      {#each meanings as meaning (meaning.key)}
        {@const held = claimsUnder(claims, meaning.key)}
        {@const heldReadings = held.filter(claim => claim.kind === 'reading')}
        {@const heldRelations = held.filter(claim => claim.kind === 'relation')}
        <li class="sense claim" id="claim-{meaning.key}">
          <p class="meaning">{meaning.value}{@render basis(meaning)}</p>
          {#if held.length}
            <dl class="held">
              {#if heldReadings.length}<div><dt>{t('field.reading')}</dt><dd><ul class="readings">{#each heldReadings as reading (reading.key)}{@render read(reading, home.get(reading.key) === meaning.key, heldRelations)}{/each}</ul></dd></div>{/if}
              {#if heldRelations.length}<div><dt>{t('field.relatedCharacters')}</dt><dd class="relateds">{#each heldRelations as relation (relation.key)}{@render related(relation)}{/each}</dd></div>{/if}
            </dl>
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}
{#if general.length}
  <section class="block">
    <h3>{t('field.reading')}</h3>
    <ul class="readings">{#each general as reading (reading.key)}{@render read(reading, true)}{/each}</ul>
  </section>
{/if}
{#if relations.length}
  <section class="block">
    <h3>{t('field.relatedCharacters')}</h3>
    <ul class="relations">
      {#each relations as relation (relation.key)}
        {@const scopes = scopesOf(claims, relation)}
        <li class="relation claim" id="claim-{relation.key}">
          <span class="character">{relation.value}</span><CopyButton text={relation.value} />
          <span class="relation-body">
            <span class="stated"><span class="badge">{t(`relationship.${String(relation.data?.relationship)}`)}</span>{@render basis(relation)}</span>
            {#if scopes.length}
              <span class="scopes">
                {#each scopes as scope (scope.key)}
                  <a class="scope" href="#claim-{scope.key}"><span class="kind">{t(`field.${scope.kind}`)}</span><span class="text">{claimLabel(scope)}</span></a>
                {/each}
              </span>
            {/if}
            {#if relation.data?.difference}<span class="description">{relation.data.difference}</span>{/if}
            {#if relation.data?.evidence}<span class="description muted">{relation.data.evidence}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .block { display: flex; flex-direction: column; gap: 8px; min-width: 0 }
  h3 { font-size: 14px; font-weight: 600 }
  ol, ul { margin: 0; padding: 0; list-style: none }
  .senses, .relations { display: flex; flex-direction: column; gap: 8px }
  .sense { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 7px }
  .numbered { counter-reset: sense }
  .numbered .sense { counter-increment: sense; padding-inline-start: 40px; position: relative }
  .numbered .sense::before { content: counter(sense); position: absolute; inset-inline-start: 14px; inset-block-start: 12px; color: var(--muted); font-variant-numeric: tabular-nums; line-height: 1.6 }
  .meaning { font-size: 15px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere }
  .held { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: baseline; gap: 8px 16px; margin: 0; padding-top: 10px; border-top: 1px dashed var(--line) }
  .held > div { display: contents }
  dt { color: var(--muted); font-size: 12px }
  dd { margin: 0; min-width: 0 }
  .readings { display: flex; flex-direction: column; gap: 4px }
  .readings li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; overflow-wrap: anywhere }
  .relateds { display: flex; flex-wrap: wrap; gap: 6px }
  .related { display: inline-flex; align-items: baseline; gap: 6px; padding: 1px 9px 1px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 12.5px; white-space: nowrap }
  .related .character { color: var(--ink); font-size: 16px; line-height: 1.4 }
  .related:hover, .scope:hover { border-color: var(--accent); color: var(--accent) }
  .bases { display: inline-flex; flex-wrap: wrap; gap: 6px }
  .basis { color: var(--muted); font-size: 11.5px; white-space: nowrap }
  .meaning .bases { margin-inline-start: 8px }
  .basis:hover { color: var(--accent) }
  .relation { display: flex; align-items: flex-start; gap: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 7px }
  .relation > .character { flex: none; min-width: 1.2em; font-size: 26px; line-height: 1.3; text-align: center }
  .relation-body { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0 }
  .stated { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px }
  .scopes { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; max-width: 100% }
  .scope { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%; padding: 1px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12.5px }
  .scope .kind { flex: none; color: var(--muted); font-size: 11.5px }
  .scope .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .description { white-space: pre-wrap; overflow-wrap: anywhere }
  /* The claim a link on the page leads to. */
  .claim { scroll-margin-block: 16px }
  .claim:target { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 7px }
  @media (max-width: 560px) { .held { grid-template-columns: minmax(0, 1fr); gap: 4px } .held dd { margin-bottom: 6px } }
</style>
