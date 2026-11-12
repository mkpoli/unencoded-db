<script lang="ts">
  // The parts tagged for the first description, with the role of each: a line that stays folded
  // until someone opens it. The parsed parts are the starting point; an editor may add, rename or
  // remove them, type a role beyond the three, and name a formation the roles cannot express.
  import { onMount, tick, untrack } from 'svelte'
  import { analyze, composeValue, formationOf, parseComposition, FORMATIONS, FORMATION_MAX, PART_MAX, PARTS_MAX, ROLES, ROLE_MAX } from '$lib/composition'
  import { formationFromLabel, formationLabel, roleFromLabel, roleLabel } from '$lib/composition-labels'
  import { splitIds } from '$lib/ids'
  import { locale, t } from '$lib/t'
  import FactLine from './FactLine.svelte'

  type Row = { part: string; roleText: string }

  let { ids = '', value = '' }: { ids?: string; value?: string } = $props()

  const uid = $props.id()
  const at = locale()
  let hydrated = $state(false)
  onMount(() => { hydrated = true })

  /** The rows and formation a stored value gives, or null while the description is not one. */
  function load(storedValue: string, sequence: string) {
    const stored = parseComposition(storedValue)
    const base = analyze(sequence, stored)
    if (!base) return null
    return {
      rows: base.parts.map(part => ({ part: part.part, roleText: part.role ? roleLabel(at, part.role) : '' })),
      formation: stored?.ids === sequence && stored.formation ? formationLabel(at, stored.formation) : '',
    }
  }

  const primary = $derived(splitIds(ids)[0] ?? '')
  const parsed = $derived(analyze(primary, null))
  const initial = untrack(() => load(value, primary))
  let rows = $state<Row[]>(initial?.rows ?? [])
  let formationText = $state(initial?.formation ?? '')
  let partsBox = $state<HTMLDivElement>()
  let loadedFor = untrack(() => primary)

  // Unsaved rows stay while the description is being typed, and start again from its parts once it
  // becomes a different complete description.
  $effect(() => {
    const sequence = primary
    if (sequence === loadedFor) return
    const next = load(untrack(() => value), sequence)
    if (!next) return
    rows = next.rows
    formationText = next.formation
    loadedFor = sequence
  })

  const filled = $derived(rows.filter(row => row.part.trim()))
  const roleCodes = $derived(filled.map(row => roleFromLabel(at, row.roleText)))
  const tags = $derived(filled.flatMap((row, index) => roleCodes[index] ? [{ part: row.part.trim(), role: roleCodes[index]! }] : []))
  const suggested = $derived(formationOf(roleCodes) ?? (parsed && parsed.parts.length === 0 && !filled.length ? 'single' : 'unknown'))
  const override = $derived(formationText.trim() ? formationFromLabel(at, formationText) : '')
  const resolved = $derived(override || suggested)
  const set = $derived(Boolean(tags.length || override))
  const serialized = $derived(set ? composeValue(primary, filled.map(row => row.part.trim()), roleCodes, override || null) : '')

  async function add() {
    if (rows.length >= PARTS_MAX) return
    rows = [...rows, { part: '', roleText: '' }]
    await tick()
    partsBox?.querySelector<HTMLInputElement>('.row-item:last-child .part')?.focus()
  }
</script>

{#if parsed}
  <FactLine label={t('field.formation')} stated={set}>
    {#snippet value()}
      <span class="formation">{formationLabel(at, resolved)}</span>
      {#each tags as tag, index (index)}<span class="tag">{tag.part} · {roleLabel(at, tag.role)}</span>{/each}
    {/snippet}
    {#if rows.length}
      <div class="parts" bind:this={partsBox}>
        <div class="head" aria-hidden="true"><span>{t('field.part')}</span><span>{t('field.role')}</span><span></span></div>
        {#each rows as row, index (index)}
          <div class="row-item">
            <input class="input part" bind:value={row.part} maxlength={PART_MAX} placeholder={t('field.part')} aria-label={`${t('field.part')} ${index + 1}`} autocomplete="off" spellcheck="false" disabled={!hydrated} />
            <input class="input" bind:value={row.roleText} maxlength={ROLE_MAX} list="{uid}-roles" placeholder={t('field.role')} aria-label={`${t('field.role')} ${index + 1}`} autocomplete="off" disabled={!hydrated} />
            <button type="button" class="remove" aria-label={`${t('field.removePart')} ${index + 1}`} onclick={() => rows = rows.filter((_, i) => i !== index)} disabled={!hydrated}><span aria-hidden="true">×</span></button>
          </div>
        {/each}
      </div>
    {/if}
    <button type="button" class="text-button add" disabled={!hydrated || rows.length >= PARTS_MAX} onclick={add}>+ {t('field.addPart')}</button>
    <div class="field formation-name">
      <label for="{uid}-formation">{t('field.formationOverride')}</label>
      <input id="{uid}-formation" class="input" bind:value={formationText} maxlength={FORMATION_MAX} list="{uid}-formations" placeholder={formationLabel(at, suggested)} autocomplete="off" disabled={!hydrated} />
    </div>
    <datalist id="{uid}-roles">{#each ROLES as role}<option value={roleLabel(at, role)}></option>{/each}</datalist>
    <datalist id="{uid}-formations">{#each FORMATIONS as formation}<option value={formationLabel(at, formation)}></option>{/each}</datalist>
  </FactLine>
  <input type="hidden" name="composition" value={serialized} />
{/if}

<style>
  .formation { color: var(--accent); font-weight: 600 }
  .tag { padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 12.5px }
  .parts { display: grid; gap: 6px }
  .head, .row-item { display: grid; grid-template-columns: minmax(72px, 110px) minmax(0, 1fr) 28px; align-items: center; gap: 8px }
  .head { color: var(--muted); font-size: 12.5px }
  .part { text-align: center }
  .remove { width: 28px; align-self: stretch; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .add { justify-self: start }
  .add:disabled { color: var(--muted); cursor: default; text-decoration: none }
  .formation-name { padding-top: 10px; border-top: 1px solid var(--line) }
  @media (max-width: 700px) { .head, .row-item { grid-template-columns: minmax(56px, 80px) minmax(0, 1fr) 28px } }
</style>
