<script lang="ts">
  // Characters this one is compared with: the relationship, what differs, and the evidence for it.
  import { untrack } from 'svelte'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { RELATION_KINDS, type RelatedDraft } from '$lib/related'
  import { t } from '$lib/t'
  import SightingChoice, { type SightingOption } from './SightingChoice.svelte'

  type Row = RelatedDraft & { sighting: string }
  // `fill` are variants a reference table names; each is added unless the list already compares it.
  let { values = [], sightings = null, fill = [] }: { values?: (RelatedDraft & { sighting_id: number | null })[]; sightings?: SightingOption[] | null; fill?: { character: string; field: string }[] } = $props()

  const uid = $props.id()
  const blank = (): Row => ({ character: '', relationship: 'uncertain', difference: '', evidence: '', sighting: '' })
  let rows = $state<Row[]>(untrack(() => values.map(({ sighting_id, ...relation }) => ({ ...relation, sighting: sighting_id ? String(sighting_id) : '' }))))

  $effect(() => {
    if (!fill.length) return
    untrack(() => {
      for (const { character, field } of fill) {
        if (rows.length >= CLAIM_LIMITS.relation.max || rows.some(row => row.character === character)) continue
        rows.push({ character, relationship: 'variant', difference: '', evidence: `Unihan ${field}`, sighting: '' })
      }
    })
  })
</script>

<fieldset class="group stack">
  <legend class="label">{t('field.relatedCharacters')}</legend>
  <input type="hidden" name="related_characters_present" value="1" />
  {#each rows as row, i}
    <div class="comparison">
      <div class="grid-2">
        <div class="field"><label for="{uid}-character-{i}">{t('field.relatedCharacter')}</label><input class="input character" id="{uid}-character-{i}" name="related_character" maxlength={CLAIM_LIMITS.relation.length} bind:value={row.character} required autocomplete="off" spellcheck="false" /></div>
        <div class="field"><label for="{uid}-relationship-{i}">{t('field.relatedRelationship')}</label><select class="input" id="{uid}-relationship-{i}" name="related_relationship" bind:value={row.relationship}>{#each RELATION_KINDS as kind}<option value={kind}>{t(`relationship.${kind}`)}</option>{/each}</select></div>
      </div>
      <div class="field"><label for="{uid}-difference-{i}">{t('field.relatedDifference')}</label><textarea class="input" id="{uid}-difference-{i}" name="related_difference" maxlength="5000" bind:value={row.difference}></textarea></div>
      <div class="field"><label for="{uid}-evidence-{i}">{t('field.relatedEvidence')}</label><textarea class="input" id="{uid}-evidence-{i}" name="related_evidence" maxlength="5000" bind:value={row.evidence}></textarea></div>
      {#if sightings}<div class="field"><SightingChoice id="{uid}-sighting-{i}" name="related_sighting" {sightings} bind:value={row.sighting} labelled /></div>{/if}
      <div><button class="button" type="button" onclick={() => rows.splice(i, 1)}>{t('form.removeRelated')}</button></div>
    </div>
  {/each}
  {#if rows.length < CLAIM_LIMITS.relation.max}<div><button class="button" type="button" onclick={() => rows.push(blank())}>{t('form.addRelated')}</button></div>{/if}
</fieldset>

<style>
  .group { min-width: 0; margin: 0; padding: 0; border: 0; gap: 12px }
  .group legend { padding: 0; margin-bottom: 6px }
  .comparison { display: flex; flex-direction: column; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 8px }
  .character { font-size: 18px }
  textarea.input { min-height: 64px }
</style>
