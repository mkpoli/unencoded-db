<script lang="ts">
  // The characters a character is compared with, each under the meanings and readings ticked beside it
  // and resting on the evidence ticked beside it. The rows live with the meanings and readings in the
  // same draft, so a comparison can name a sense as soon as it is typed.
  import { tick } from 'svelte'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { RELATION_KINDS } from '$lib/related'
  import type { SenseDraft } from '$lib/sense-draft.svelte'
  import { t } from '$lib/t'
  import ChoiceGroup, { type Choice } from './ChoiceGroup.svelte'

  let { senses, evidence = [] }: { senses: SenseDraft; evidence?: Choice[] } = $props()
  const uid = $props.id()
  const sightings = $derived([...evidence, ...senses.unlisted])
  let group = $state<HTMLElement>()

  async function add() {
    const row = senses.addRelation()
    await tick()
    group?.querySelector<HTMLElement>(`[data-row="${row.key}"] [data-first]`)?.focus()
  }
</script>

<fieldset class="group" bind:this={group}>
  <legend class="section-title">{t('field.relatedCharacters')}</legend>
  <input type="hidden" name="related_characters_present" value="1" />
  {#each senses.relations as row, index (row)}
    <div class="item" data-row={row.key}>
      <input type="hidden" name="related_key" value={row.key} />
      <div class="grid-2">
        <div class="field"><label for="{uid}-character-{index}">{t('field.relatedCharacter')}</label><input class="input character" id="{uid}-character-{index}" name="related_character" maxlength={CLAIM_LIMITS.relation.length} bind:value={row.character} required autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" data-first /></div>
        <div class="field"><label for="{uid}-relationship-{index}">{t('field.relatedRelationship')}</label><select class="input" id="{uid}-relationship-{index}" name="related_relationship" bind:value={row.relationship}>{#each RELATION_KINDS as kind}<option value={kind}>{t(`relationship.${kind}`)}</option>{/each}</select></div>
      </div>
      <ChoiceGroup legend={t('field.meaning')} name={row.key ? `under.${row.key}` : undefined} options={senses.meaningChoices} bind:chosen={row.under} />
      <ChoiceGroup legend={t('field.reading')} name={row.key ? `under.${row.key}` : undefined} options={senses.readingChoices} bind:chosen={row.under} />
      <div class="grid-2">
        <div class="field"><label for="{uid}-difference-{index}">{t('field.relatedDifference')}</label><textarea class="input" id="{uid}-difference-{index}" name="related_difference" rows="2" maxlength="5000" bind:value={row.difference}></textarea></div>
        <div class="field"><label for="{uid}-note-{index}">{t('field.relatedEvidence')}</label><textarea class="input" id="{uid}-note-{index}" name="related_evidence" rows="2" maxlength="5000" bind:value={row.note}></textarea></div>
      </div>
      <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
      <div><button class="text-button" type="button" aria-label="{t('form.removeRelated')} {index + 1}" onclick={() => senses.relations.splice(index, 1)}>{t('form.removeRelated')}</button></div>
    </div>
  {/each}
  {#if senses.relations.length < CLAIM_LIMITS.relation.max}<div><button class="text-button" type="button" onclick={add}>+ {t('form.addRelated')}</button></div>{/if}
</fieldset>

<style>
  .group { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .group > legend { padding: 0; margin-bottom: 8px }
  .item { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .item textarea.input { min-height: 64px }
  .character { font-size: 18px }
  .item:focus-within { border-color: var(--line-strong) }
</style>
