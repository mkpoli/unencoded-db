<script lang="ts">
  // What a character means, how it is read and which characters it is related to, as three lists of one
  // group: a row of one names rows of another. A reading holds under the meanings ticked beside it, a
  // related character under meanings and readings, and every row rests on the evidence ticked beside it.
  //
  // Each row carries its claim's key, which a new row is given here, so that the rows of one form can name
  // each other before any of them is saved. A row's choices are sent as `under.<key>` and `sightings.<key>`.
  // The `…_present` markers save an emptied list.
  import { onMount, tick, untrack } from 'svelte'
  import { CLAIM_LIMITS, claimsOf, newClaimKey, type Claim } from '$lib/claims'
  import type { CharacterFacts } from '$lib/character-tables'
  import { doculectName } from '$lib/claim-label'
  import { DOCULECTS, DOCULECT_MAX, OTHER_DOCULECT, isDoculect } from '$lib/doculects'
  import { RELATION_KINDS } from '$lib/related'
  import { t } from '$lib/t'
  import ChoiceGroup, { type Choice } from './ChoiceGroup.svelte'

  // `evidence` is what a row can rest on. `fill` is what is known of an encoded character, stated where
  // the lists are still empty.
  let { claims = [], evidence = [], fill = null }: { claims?: Claim[]; evidence?: Choice[]; fill?: CharacterFacts | null } = $props()

  const uid = $props.id()
  type Links = { key: string; evidence: string[]; under: string[] }
  type Meaning = Links & { value: string }
  type Reading = Links & { value: string; doculect: string; other: string }
  type Relation = Links & { character: string; relationship: string; difference: string; note: string }

  // A sighting the page does not offer, hidden since it was chosen, stays a choice of the row that names it.
  const offered = untrack(() => new Map(evidence.map(option => [option.value, option.token])))
  const unlisted = untrack(() => [...new Set(claims.flatMap(claim => claim.sightings))].filter(id => !offered.has(String(id))).map((id): Choice => ({ token: String(id), value: String(id), label: `#${id}` })))
  const sightings = $derived([...evidence, ...unlisted])
  const links = (claim: Claim): Links => ({ key: claim.key, evidence: claim.sightings.map(id => offered.get(String(id)) ?? String(id)), under: [...claim.under] })
  const fresh = (under: string[] = []): Links => ({ key: newClaimKey(), evidence: [], under })
  const stated = (doculect: unknown) => typeof doculect !== 'string' || !doculect ? { doculect: '', other: '' } : isDoculect(doculect) ? { doculect, other: '' } : { doculect: OTHER_DOCULECT, other: doculect }

  // The row a list opens with has no key until the page runs here, where the server's row and this one
  // are the same row.
  const blank = (): Links => ({ key: '', evidence: [], under: [] })
  let meanings = $state<Meaning[]>(untrack(() => { const found = claimsOf(claims, 'meaning').map(claim => ({ ...links(claim), value: claim.value })); return found.length ? found : [{ ...blank(), value: '' }] }))
  let readings = $state<Reading[]>(untrack(() => { const found = claimsOf(claims, 'reading').map(claim => ({ ...links(claim), value: claim.value, ...stated(claim.data?.doculect) })); return found.length ? found : [{ ...blank(), value: '', doculect: '', other: '' }] }))
  let relations = $state<Relation[]>(untrack(() => claimsOf(claims, 'relation').map(claim => ({ ...links(claim), character: claim.value, relationship: String(claim.data?.relationship ?? 'uncertain'), difference: String(claim.data?.difference ?? ''), note: String(claim.data?.evidence ?? '') }))))
  onMount(() => { for (const row of [...meanings, ...readings, ...relations]) row.key ||= newClaimKey() })

  const meaningChoices = $derived(meanings.filter(row => row.key && row.value.trim()).map((row): Choice => ({ token: row.key, value: row.key, label: row.value.trim() })))
  const readingChoices = $derived(readings.filter(row => row.key && row.value.trim()).map((row): Choice => {
    const doculect = row.doculect === OTHER_DOCULECT ? row.other.trim() : row.doculect
    return { token: row.key, value: row.key, label: doculect ? `${doculectName(doculect)} ${row.value.trim()}` : row.value.trim() }
  }))

  let group = $state<HTMLElement>()
  async function focus(key: string) {
    await tick()
    group?.querySelector<HTMLElement>(`[data-row="${key}"] [data-first]`)?.focus()
  }
  function addMeaning() { const row = { ...fresh(), value: '' }; meanings.push(row); focus(row.key) }
  function addReading(under: string[] = []) { const row = { ...fresh(under), value: '', doculect: '', other: '' }; readings.push(row); focus(row.key) }
  function addRelation(under: string[] = []) { const row = { ...fresh(under), character: '', relationship: 'uncertain', difference: '', note: '' }; relations.push(row); focus(row.key) }

  $effect(() => {
    if (!fill) return
    const facts = fill
    untrack(() => {
      if (facts.readings.length && !readings.some(row => row.value.trim())) readings = facts.readings.slice(0, CLAIM_LIMITS.reading.max).map(item => ({ ...fresh(), value: item.value.slice(0, CLAIM_LIMITS.reading.length), ...stated(item.doculect) }))
      if (facts.meaning && !meanings.some(row => row.value.trim())) meanings = [{ ...fresh(), value: facts.meaning.slice(0, CLAIM_LIMITS.meaning.length) }]
      for (const { character, field } of facts.variants) {
        if (relations.length >= CLAIM_LIMITS.relation.max || relations.some(row => row.character === character)) continue
        relations.push({ ...fresh(), character, relationship: 'variant', difference: '', note: `Unihan ${field}` })
      }
    })
  })
</script>

<div class="senses" bind:this={group}>
  <fieldset class="group">
    <legend class="section-title">{t('field.meaning')}</legend>
    <input type="hidden" name="meanings_present" value="1" />
    {#each meanings as row, index (row)}
      <div class="item" data-row={row.key}>
        <input type="hidden" name="meaning_key" value={row.key} />
        <div class="line">
          <textarea class="input" name="meaning" rows="1" maxlength={CLAIM_LIMITS.meaning.length} bind:value={row.value} aria-label="{t('field.meaning')} {index + 1}" data-first></textarea>
          {#if meanings.length > 1 || row.value}<button class="remove" type="button" aria-label="{t('form.remove')} {t('field.meaning')} {index + 1}" title={t('form.remove')} onclick={() => meanings.splice(index, 1)}><span aria-hidden="true">×</span></button>{/if}
        </div>
        <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
        {#if row.key && row.value.trim()}
          <div class="row under">
            {#if readings.length < CLAIM_LIMITS.reading.max}<button class="text-button" type="button" aria-label="{t('field.readingAdd')} · {t('field.meaning')} {index + 1}" onclick={() => addReading([row.key])}>+ {t('field.readingAdd')}</button>{/if}
            {#if relations.length < CLAIM_LIMITS.relation.max}<button class="text-button" type="button" aria-label="{t('form.addRelated')} · {t('field.meaning')} {index + 1}" onclick={() => addRelation([row.key])}>+ {t('form.addRelated')}</button>{/if}
          </div>
        {/if}
      </div>
    {/each}
    {#if meanings.length < CLAIM_LIMITS.meaning.max}<div><button class="text-button" type="button" onclick={addMeaning}>+ {t('field.meaningAdd')}</button></div>{/if}
  </fieldset>

  <fieldset class="group">
    <legend class="section-title">{t('field.reading')}</legend>
    <input type="hidden" name="readings_present" value="1" />
    {#each readings as row, index (row)}
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
          {#if readings.length > 1 || row.value}<button class="remove" type="button" aria-label="{t('form.remove')} {t('field.reading')} {index + 1}" title={t('form.remove')} onclick={() => readings.splice(index, 1)}><span aria-hidden="true">×</span></button>{/if}
        </div>
        <ChoiceGroup legend={t('field.meaning')} name={row.key ? `under.${row.key}` : undefined} options={meaningChoices} bind:chosen={row.under} />
        <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
      </div>
    {/each}
    {#if readings.length < CLAIM_LIMITS.reading.max}<div><button class="text-button" type="button" onclick={() => addReading()}>+ {t('field.readingAdd')}</button></div>{/if}
  </fieldset>

  <fieldset class="group">
    <legend class="section-title">{t('field.relatedCharacters')}</legend>
    <input type="hidden" name="related_characters_present" value="1" />
    {#each relations as row, index (row)}
      <div class="item" data-row={row.key}>
        <input type="hidden" name="related_key" value={row.key} />
        <div class="grid-2">
          <div class="field"><label for="{uid}-character-{index}">{t('field.relatedCharacter')}</label><input class="input character" id="{uid}-character-{index}" name="related_character" maxlength={CLAIM_LIMITS.relation.length} bind:value={row.character} required autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" data-first /></div>
          <div class="field"><label for="{uid}-relationship-{index}">{t('field.relatedRelationship')}</label><select class="input" id="{uid}-relationship-{index}" name="related_relationship" bind:value={row.relationship}>{#each RELATION_KINDS as kind}<option value={kind}>{t(`relationship.${kind}`)}</option>{/each}</select></div>
        </div>
        <ChoiceGroup legend={t('field.meaning')} name={row.key ? `under.${row.key}` : undefined} options={meaningChoices} bind:chosen={row.under} />
        <ChoiceGroup legend={t('field.reading')} name={row.key ? `under.${row.key}` : undefined} options={readingChoices} bind:chosen={row.under} />
        <div class="grid-2">
          <div class="field"><label for="{uid}-difference-{index}">{t('field.relatedDifference')}</label><textarea class="input" id="{uid}-difference-{index}" name="related_difference" rows="2" maxlength="5000" bind:value={row.difference}></textarea></div>
          <div class="field"><label for="{uid}-note-{index}">{t('field.relatedEvidence')}</label><textarea class="input" id="{uid}-note-{index}" name="related_evidence" rows="2" maxlength="5000" bind:value={row.note}></textarea></div>
        </div>
        <ChoiceGroup legend={t('field.basis')} name={row.key ? `sightings.${row.key}` : undefined} options={sightings} bind:chosen={row.evidence} />
        <div><button class="text-button" type="button" aria-label="{t('form.removeRelated')} {index + 1}" onclick={() => relations.splice(index, 1)}>{t('form.removeRelated')}</button></div>
      </div>
    {/each}
    {#if relations.length < CLAIM_LIMITS.relation.max}<div><button class="text-button" type="button" onclick={() => addRelation()}>+ {t('form.addRelated')}</button></div>{/if}
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
  .character { font-size: 18px }
  .under { gap: 4px 18px }
  .remove { grid-column: -2; width: 28px; height: 42px; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .item:focus-within { border-color: var(--line-strong) }
  @media (max-width: 560px) { .line.reading { grid-template-columns: minmax(0, 1fr) 28px } .line.reading > .doculect { grid-column: 1 / -1 } }
</style>
