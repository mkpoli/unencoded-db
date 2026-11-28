<script lang="ts">
  // The parts tagged for the first description, with the role and optional reusable function of
  // each: a line that stays folded until someone opens it. The parsed parts are the starting point;
  // an editor may add, rename or remove them, type a role beyond the standard ones, reuse or create
  // a part-specific function label (作用), and name a formation the roles cannot express.
  import { onMount, tick, untrack } from 'svelte'
  import { analyze, composeValue, formationOf, parseComposition, partKey, validPartKey, FORMATIONS, FORMATION_MAX, FUNCTION_MAX, PART_MAX, PARTS_MAX, ROLES, ROLE_MAX } from '$lib/composition'
  import { formationFromLabel, formationLabel, roleFromLabel, roleLabel } from '$lib/composition-labels'
  import { splitIds } from '$lib/ids'
  import { locale, t } from '$lib/t'
  import FactLine from './FactLine.svelte'

  type Row = { part: string; roleText: string; funcText: string }

  let { ids = '', value = '', anchor }: { ids?: string; value?: string; anchor?: string } = $props()

  const uid = $props.id()
  const at = locale()
  let hydrated = $state(false)
  let open = $state(false)
  onMount(() => { hydrated = true })

  /** The rows and formation a stored value gives, or null while the description is not one. */
  function load(storedValue: string, sequence: string) {
    const stored = parseComposition(storedValue)
    const base = analyze(sequence, stored)
    if (!base) return null
    return {
      rows: base.parts.map(part => ({
        part: part.part,
        roleText: part.role ? roleLabel(at, part.role) : '',
        funcText: part.func ?? '',
      })),
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

  // Shared function labels already recorded for each canonical component, fetched lazily when the
  // editor opens so typing a component surfaces existing labels for reuse.
  let suggestions = $state<Record<string, string[]>>({})
  const fetched = new Set<string>()

  $effect(() => {
    if (!hydrated || !open) return
    const keys = [...new Set(rows.map(row => partKey(row.part)).filter(key => validPartKey(key) && !fetched.has(key)))]
    if (!keys.length) return
    const timer = setTimeout(() => {
      for (const key of keys) {
        if (fetched.has(key)) continue
        fetched.add(key)
        fetch(`/api/parts/functions?part=${encodeURIComponent(key)}`)
          .then(res => res.ok ? res.json() as Promise<{ functions?: { func: string }[] }> : null)
          .then(payload => {
            if (!payload?.functions) return
            suggestions = { ...suggestions, [key]: payload.functions.map(item => item.func) }
          })
          .catch(() => { fetched.delete(key) })
      }
    }, 200)
    return () => clearTimeout(timer)
  })

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
  const funcValues = $derived(filled.map(row => [...row.funcText.normalize('NFC').trim()].slice(0, FUNCTION_MAX).join('')))
  const tags = $derived(filled.flatMap((row, index) => (roleCodes[index] || funcValues[index])
    ? [{ part: row.part.trim(), role: roleCodes[index]!, func: funcValues[index]! }]
    : []))
  const suggested = $derived(formationOf(roleCodes) ?? (parsed && parsed.parts.length === 0 && !filled.length ? 'single' : 'unknown'))
  const override = $derived(formationText.trim() ? formationFromLabel(at, formationText) : '')
  const resolved = $derived(override || suggested)
  const set = $derived(Boolean(tags.length || override))
  const serialized = $derived(set ? composeValue(primary, filled.map(row => row.part.trim()), roleCodes, override || null, funcValues) : '')

  async function add() {
    if (rows.length >= PARTS_MAX) return
    rows = [...rows, { part: '', roleText: '', funcText: '' }]
    await tick()
    partsBox?.querySelector<HTMLInputElement>('.row-item:last-child .part')?.focus()
  }
</script>

{#if parsed}
  <FactLine id={anchor} label={t('field.formation')} stated={set} bind:open>
    {#snippet value()}
      <span class="formation">{formationLabel(at, resolved)}</span>
      {#each tags as tag, index (index)}<span class="tag">{[tag.part, tag.role && roleLabel(at, tag.role), tag.func].filter(Boolean).join(' · ')}</span>{/each}
    {/snippet}
    {#if rows.length}
      <div class="parts" bind:this={partsBox}>
        <div class="head" aria-hidden="true"><span>{t('field.part')}</span><span>{t('field.role')}</span><span>{t('field.partFunction')}</span><span></span></div>
        {#each rows as row, index (index)}
          {@const key = partKey(row.part)}
          {@const options = suggestions[key] ?? []}
          <div class="row-item">
            <input class="input part" bind:value={row.part} maxlength={PART_MAX} placeholder={t('field.part')} aria-label={`${t('field.part')} ${index + 1}`} autocomplete="off" spellcheck="false" disabled={!hydrated} />
            <input class="input role" bind:value={row.roleText} maxlength={ROLE_MAX} list="{uid}-roles" placeholder={t('field.role')} aria-label={`${t('field.role')} ${index + 1}`} autocomplete="off" disabled={!hydrated} />
            <input class="input func" bind:value={row.funcText} maxlength={FUNCTION_MAX} list="{uid}-func-{index}" placeholder={t('field.partFunctionHint')} aria-label={`${t('field.partFunction')} ${index + 1}`} autocomplete="off" disabled={!hydrated} />
            <button type="button" class="remove" aria-label={`${t('field.removePart')} ${index + 1}`} onclick={() => rows = rows.filter((_, i) => i !== index)} disabled={!hydrated}><span aria-hidden="true">×</span></button>
            <datalist id="{uid}-func-{index}">{#each options as option (option)}<option value={option}></option>{/each}</datalist>
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
  .head, .row-item { display: grid; grid-template-columns: minmax(60px, 86px) minmax(92px, 128px) minmax(0, 1fr) 28px; align-items: center; gap: 8px }
  .head { color: var(--muted); font-size: 12.5px }
  .part { text-align: center }
  .remove { width: 28px; align-self: stretch; padding: 0; border: 0; background: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer }
  .remove:hover { color: var(--wrong) }
  .add { justify-self: start }
  .add:disabled { color: var(--muted); cursor: default; text-decoration: none }
  .formation-name { padding-top: 10px; border-top: 1px solid var(--line) }
  @media (max-width: 700px) {
    .head { display: none }
    .row-item { grid-template-columns: minmax(56px, 76px) minmax(0, 1fr) 28px; padding-bottom: 6px; border-bottom: 1px dashed var(--line) }
    .row-item:last-child { padding-bottom: 0; border-bottom: 0 }
    .func { grid-column: 1 / -1 }
  }
</style>
