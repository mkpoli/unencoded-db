<script lang="ts">
  import { t } from '$lib/t'
  import { untrack } from 'svelte'
  import { parseRelatedDraft, RELATION_KINDS, type RelatedDraft } from '$lib/related'
  let { value = null }: { value?: string | null } = $props()
  const blank = (): RelatedDraft => ({ character: '', relationship: 'uncertain', difference: '', evidence: '' })
  let rows = $state<RelatedDraft[]>(untrack(() => parseRelatedDraft(value)))
  const label = (key: `${string}.${string}`, fallback: string) => { const text = t(key); return text === key ? fallback : text }
</script>

<fieldset class="comparisons stack">
  <legend>{label('field.relatedCharacters', 'Related characters')}</legend>
  <input type="hidden" name="related_characters_present" value="1" />
  {#each rows as row, i}
    <div class="comparison stack">
      <div class="field"><label for={'related-character-' + i}>{label('field.relatedCharacter', 'Related character')}</label><input class="input" id={'related-character-' + i} name="related_character" maxlength="80" bind:value={row.character} required /></div>
      <div class="field"><label for={'related-relationship-' + i}>{label('field.relatedRelationship', 'Relationship')}</label><select class="input" id={'related-relationship-' + i} name="related_relationship" bind:value={row.relationship}>{#if !(RELATION_KINDS as readonly string[]).includes(row.relationship)}<option value={row.relationship}>{row.relationship || '—'}</option>{/if}<option value="variant">{label('relationship.variant', 'Variant')}</option><option value="not_variant">{label('relationship.not_variant', 'Not a variant')}</option><option value="similar">{label('relationship.similar', 'Similar')}</option><option value="uncertain">{label('relationship.uncertain', 'Uncertain')}</option></select></div>
      <div class="field"><label for={'related-difference-' + i}>{label('field.relatedDifference', 'Differences')}</label><textarea class="input" id={'related-difference-' + i} name="related_difference" maxlength="5000" bind:value={row.difference}></textarea></div>
      <div class="field"><label for={'related-evidence-' + i}>{label('field.relatedEvidence', 'Evidence or source')}</label><textarea class="input" id={'related-evidence-' + i} name="related_evidence" maxlength="5000" bind:value={row.evidence}></textarea></div>
      <button class="button" type="button" onclick={() => rows.splice(i, 1)}>{label('form.removeRelated', 'Remove comparison')}</button>
    </div>
  {/each}
  {#if rows.length < 50}<button class="button" type="button" onclick={() => rows.push(blank())}>{label('form.addRelated', 'Add comparison')}</button>{/if}
</fieldset>
<style>
  .comparisons { border:1px solid var(--line); border-radius:8px; padding:12px; min-width:0 }
  .comparison { border-bottom:1px solid var(--line); padding-bottom:12px }
</style>
