<script lang="ts" module>
  export type SightingOption = { id: number; place: string }
</script>

<script lang="ts">
  // The sighting a statement rests on, chosen from the record's own.
  import { t } from '$lib/t'

  let { id, name, sightings, value = $bindable(''), labelled = false }: { id: string; name: string; sightings: SightingOption[]; value?: string; labelled?: boolean } = $props()
  const short = (text: string) => [...text].length > 40 ? [...text].slice(0, 39).join('') + '…' : text
</script>

{#if labelled}<label for={id}>{t('field.basis')}</label>{/if}
<select {id} class="input" {name} bind:value aria-label={labelled ? undefined : t('field.basis')}>
  <option value="">—</option>
  {#each sightings as sighting (sighting.id)}<option value={String(sighting.id)}>#{sighting.id} {short(sighting.place)}</option>{/each}
  {#if value && !sightings.some(sighting => String(sighting.id) === value)}<option {value}>#{value}</option>{/if}
</select>
