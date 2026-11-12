<script lang="ts">
  // Readings or meanings, one per row, each optionally resting on one of the record's sightings.
  // The `<kind>s_present` marker saves an emptied list.
  import { untrack } from 'svelte'
  import { CLAIM_LIMITS, type Claim } from '$lib/claims'
  import { t } from '$lib/t'
  import SightingChoice, { type SightingOption } from './SightingChoice.svelte'

  // `fill` are values to state when the list is still empty.
  let { kind, values = [], sightings = null, fill = [] }: { kind: 'reading' | 'meaning'; values?: Claim[]; sightings?: SightingOption[] | null; fill?: string[] } = $props()

  const uid = $props.id()
  type Row = { value: string; sighting: string }
  const blank = (): Row => ({ value: '', sighting: '' })
  let rows = $state<Row[]>(untrack(() => values.length ? values.map(claim => ({ value: claim.value, sighting: claim.sighting_id ? String(claim.sighting_id) : '' })) : [blank()]))
  const limit = $derived(CLAIM_LIMITS[kind])

  $effect(() => {
    if (!fill.length) return
    untrack(() => {
      if (rows.some(row => row.value.trim())) return
      rows = fill.slice(0, CLAIM_LIMITS[kind].max).map(value => ({ value: value.slice(0, CLAIM_LIMITS[kind].length), sighting: '' }))
    })
  })
</script>

<fieldset class="group">
  <legend class="label">{t(`field.${kind}`)}</legend>
  <input type="hidden" name="{kind}s_present" value="1" />
  {#each rows as row, index}
    <div class="claim" class:with-sighting={sightings}>
      {#if kind === 'meaning'}
        <textarea class="input" name={kind} rows="1" maxlength={limit.length} bind:value={row.value} aria-label="{t(`field.${kind}`)} {index + 1}"></textarea>
      {:else}
        <input class="input" name={kind} maxlength={limit.length} bind:value={row.value} aria-label="{t(`field.${kind}`)} {index + 1}" autocomplete="off" />
      {/if}
      {#if sightings}<SightingChoice id="{uid}-sighting-{index}" name="{kind}_sighting" {sightings} bind:value={row.sighting} />{/if}
      <button class="button remove" type="button" onclick={() => rows.splice(index, 1)}>{t('form.remove')}</button>
    </div>
  {/each}
  {#if rows.length < limit.max}<button class="button" type="button" onclick={() => rows.push(blank())}>{t(`field.${kind}Add`)}</button>{/if}
</fieldset>

<style>
  .group { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .group legend { padding: 0; margin-bottom: 6px }
  .claim { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; width: 100% }
  .claim.with-sighting { grid-template-columns: minmax(0, 1fr) minmax(0, 200px) auto }
  textarea.input { min-height: 42px }
  .remove { color: var(--muted) }
  @media (max-width: 560px) { .claim.with-sighting { grid-template-columns: minmax(0, 1fr) auto } .claim.with-sighting > :first-child { grid-column: 1 / -1 } }
</style>
