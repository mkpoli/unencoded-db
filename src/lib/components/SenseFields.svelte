<script lang="ts">
  // What a character means and how it is read, as two lists of one group: a reading holds under the
  // meanings ticked beside it, and every row rests on the evidence ticked beside it. The related
  // characters are the same draft, drawn by RelationFields wherever the page puts them.
  //
  // A row's choices are sent as `under.<key>` and `sightings.<key>`. The `…_present` markers save an
  // emptied list.
  import { tick } from 'svelte'
  import { CLAIM_LIMITS } from '$lib/claims'
  import { DOCULECTS, DOCULECT_MAX, OTHER_DOCULECT } from '$lib/doculects'
  import type { SenseDraft } from '$lib/sense-draft.svelte'
  import { t } from '$lib/t'
  import ChoiceGroup, { type Choice } from './ChoiceGroup.svelte'

  // The meanings and readings of `senses`, the draft the page owns. `evidence` is what a row can rest on.
  let { senses, evidence = [] }: { senses: SenseDraft; evidence?: Choice[] } = $props()
  const sightings = $derived([...evidence, ...senses.unlisted])

  let group = $state<HTMLElement>()
  async function focus(key: string) {
    await tick()
    group?.querySelector<HTMLElement>(`[data-row="${key}"] [data-first]`)?.focus()
  }
  async function addMeaning() { const row = senses.addMeaning(); await focus(row.key) }
  async function addReading(under: string[] = []) { const row = senses.addReading(under); await focus(row.key) }
  function addRelation(under: string[]) { const row = senses.addRelation(under); senses.requestFocus(row.key) }
</script>

<div class="senses" bind:this={group}>
  <fieldset class="group">
    <legend class="section-title">{t('field.meaning')}</legend>
    <input type="hidden" name="meanings_present" value="1" />
    {#each senses.meanings as row, index (row)}
      <div class="item" data-row={row.key}>
        <input type="hidden" name="meaning_key" value={row.key} />
        <div class="line">
          <textarea class="input" name="meaning" rows="1" maxlength={CLAIM_LIMITS.meaning.length} bind:value={row.value} aria-label="{t('field.meaning')} {index + 1}" data-first></textarea>
          {#if senses.meanings.length > 1 || row.value}<button class="remove" type="button" aria-label="{t('form.remove')} {t('field.meaning')} {index + 1}" title={t('form.remove')} onclick={() => senses.meanings.splice(index, 1)}><span aria-hidden="true">×</span></button>{/if}
        </div>
        <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
        {#if row.key && row.value.trim() && (senses.readings.length < CLAIM_LIMITS.reading.max || senses.relations.length < CLAIM_LIMITS.relation.max)}
          <div class="row under">
            {#if senses.readings.length < CLAIM_LIMITS.reading.max}<button class="text-button" type="button" aria-label="{t('field.readingAdd')} · {t('field.meaning')} {index + 1}" onclick={() => addReading([row.key])}>+ {t('field.readingAdd')}</button>{/if}
            {#if senses.relations.length < CLAIM_LIMITS.relation.max}<button class="text-button" type="button" aria-label="{t('form.addRelated')} · {t('field.meaning')} {index + 1}" onclick={() => addRelation([row.key])}>+ {t('form.addRelated')}</button>{/if}
          </div>
        {/if}
      </div>
    {/each}
    {#if senses.meanings.length < CLAIM_LIMITS.meaning.max}<div><button class="text-button" type="button" onclick={addMeaning}>+ {t('field.meaningAdd')}</button></div>{/if}
  </fieldset>

  <fieldset class="group">
    <legend class="section-title">{t('field.reading')}</legend>
    <input type="hidden" name="readings_present" value="1" />
    {#each senses.readings as row, index (row)}
      <div class="item" data-row={row.key}>
        <input type="hidden" name="reading_key" value={row.key} />
        <div class="line reading">
          <span class="doculect">
            <select class="input" name={row.doculect === OTHER_DOCULECT ? undefined : 'reading_doculect'} bind:value={row.doculect} aria-label="{t('field.doculect')} {index + 1}">
              <option value="">{t('field.doculectUnstated')}</option>
              {#each DOCULECTS as code (code)}<option value={code}>{t(`doculect.${code}`)}</option>{/each}
              <option value={OTHER_DOCULECT}>{t('field.doculectOther')}</option>
            </select>
            {#if row.doculect === OTHER_DOCULECT}<input class="input" name="reading_doculect" maxlength={DOCULECT_MAX} bind:value={row.other} required={Boolean(row.value.trim())} aria-label="{t('field.doculectOther')} {index + 1}" placeholder={t('field.doculectOther')} autocomplete="off" />{/if}
          </span>
          <input class="input" name="reading" maxlength={CLAIM_LIMITS.reading.length} bind:value={row.value} aria-label="{t('field.reading')} {index + 1}" autocomplete="off" data-first />
          {#if senses.readings.length > 1 || row.value}<button class="remove" type="button" aria-label="{t('form.remove')} {t('field.reading')} {index + 1}" title={t('form.remove')} onclick={() => senses.readings.splice(index, 1)}><span aria-hidden="true">×</span></button>{/if}
        </div>
        <ChoiceGroup legend={t('field.meaning')} name={row.key ? `under.${row.key}` : undefined} options={senses.meaningChoices} bind:chosen={row.under} />
        <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
      </div>
    {/each}
    {#if senses.readings.length < CLAIM_LIMITS.reading.max}<div><button class="text-button" type="button" onclick={() => addReading()}>+ {t('field.readingAdd')}</button></div>{/if}
  </fieldset>

</div>

<style>
  /* Three steps of space: a control and its choices, the rows of a list, one list and the next. */
  .senses { display: flex; flex-direction: column; gap: 24px; min-width: 0 }
  .group { display: flex; flex-direction: column; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0 }
  .group > legend { padding: 0; margin-bottom: 8px }
  .item { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
  .line { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: start; gap: 8px }
  .line.reading { grid-template-columns: minmax(0, 150px) minmax(0, 1fr) 28px }
  .doculect { display: flex; flex-direction: column; gap: 6px; min-width: 0 }
  .item textarea.input { min-height: 64px }
  .item .line textarea.input { min-height: 42px }
  .under { gap: 4px 18px }
  .remove { grid-column: -2; width: 28px; height: 42px; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .item:focus-within { border-color: var(--line-strong) }
  @media (max-width: 560px) { .line.reading { grid-template-columns: minmax(0, 1fr) 28px } .line.reading > .doculect { grid-column: 1 / -1 } }
</style>
