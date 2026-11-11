<script lang="ts">
  // The parts tagged for the first description, with the role of each. The section stays folded
  // until someone opens it, so a record without an analysis looks like the rest of the form. The
  // parsed parts are the starting point; an editor may add, rename or remove them, type a role
  // beyond the three, and name a formation the roles cannot express.
  import { onMount, tick, untrack } from 'svelte'
  import { analyze, composeValue, formationOf, parseComposition, FORMATIONS, FORMATION_MAX, PART_MAX, PARTS_MAX, ROLES, ROLE_MAX } from '$lib/composition'
  import { formationFromLabel, formationLabel, roleFromLabel, roleLabel } from '$lib/composition-labels'
  import { splitIds } from '$lib/ids'
  import { t, type Locale } from '$lib/i18n'

  type Row = { part: string; roleText: string }

  let { ids = '', value = '', locale }: { ids?: string; value?: string; locale: Locale } = $props()

  const uid = $props.id()
  const formationId = `${uid}-formation`
  const roleOptions = `${uid}-roles`
  const formationOptions = `${uid}-formations`

  let hydrated = $state(false)
  onMount(() => { hydrated = true })

  /** The rows and formation a stored value gives, or null while the description is not one. */
  function load(storedValue: string, sequence: string, at: Locale) {
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
  const initial = untrack(() => load(value, primary, locale))
  let rows = $state<Row[]>(initial?.rows ?? [])
  let formationText = $state(initial?.formation ?? '')
  let partsBox = $state<HTMLDivElement>()
  let loadedFor = untrack(() => primary)
  let loadedValue = untrack(() => value)
  let loadedLocale = untrack(() => locale)

  // Keep unsaved rows while the description is being typed; reset them when it becomes a
  // different valid description, or when a submitted value comes back. A language change
  // translates the standard labels in place.
  $effect(() => {
    const sequence = primary
    const storedValue = value
    const at = locale
    const next = load(storedValue, sequence, at)
    if (!next) return
    if (sequence === loadedFor && storedValue === loadedValue) {
      if (at === loadedLocale) return
      rows = rows.map(row => {
        const role = roleFromLabel(loadedLocale, row.roleText)
        return { ...row, roleText: role ? roleLabel(at, role) : '' }
      })
      if (formationText) formationText = formationLabel(at, formationFromLabel(loadedLocale, formationText))
      loadedLocale = at
      return
    }
    rows = next.rows
    formationText = next.formation
    loadedFor = sequence
    loadedValue = storedValue
    loadedLocale = at
  })

  const filled = $derived(rows.filter(row => row.part.trim()))
  const roleCodes = $derived(filled.map(row => roleFromLabel(locale, row.roleText)))
  const tags = $derived(filled.flatMap((row, index) => roleCodes[index] ? [{ part: row.part.trim(), role: roleCodes[index]! }] : []))
  const derivedFormation = $derived(formationOf(roleCodes))
  const suggested = $derived(derivedFormation ?? (parsed && parsed.parts.length === 0 && !filled.length ? 'single' : 'unknown'))
  const override = $derived(formationText.trim() ? formationFromLabel(locale, formationText) : '')
  const resolved = $derived(override || suggested)
  const set = $derived(Boolean(tags.length || override))
  const serialized = $derived(set ? composeValue(primary, filled.map(row => row.part.trim()), roleCodes, override || null) : '')

  async function add() {
    if (rows.length >= PARTS_MAX) return
    rows = [...rows, { part: '', roleText: '' }]
    await tick()
    partsBox?.querySelector<HTMLInputElement>('.composition-row:last-child .composition-part-input')?.focus()
  }

  function remove(index: number) {
    rows = rows.filter((_, at) => at !== index)
  }
</script>

{#if parsed}
  <details class="composition">
    <summary class="composition-summary">
      <span class="field-label">{t(locale, 'field.formation')}</span>
      {#if set}
        <span class="composition-value" aria-live="polite">{formationLabel(locale, resolved)}</span>
        <span class="composition-tags">
          {#each tags as tag, index (index)}<span class="composition-tag">{tag.part} · {roleLabel(locale, tag.role)}</span>{/each}
        </span>
      {:else}
        <span class="composition-value none" aria-live="polite">{t(locale, 'field.formationNone')}</span>
      {/if}
      <span class="composition-edit">{t(locale, 'field.formationEdit')}<span class="chevron" aria-hidden="true">⌄</span></span>
    </summary>

    <div class="composition-body">
      {#if rows.length}
        <div class="composition-parts" bind:this={partsBox}>
          <div class="composition-part-head" aria-hidden="true">
            <span>{t(locale, 'field.part')}</span>
            <span>{t(locale, 'field.role')}</span>
            <span></span>
          </div>
          {#each rows as row, index (index)}
            <div class="composition-row">
              <input
                class="input composition-part-input"
                bind:value={row.part}
                maxlength={PART_MAX}
                placeholder={t(locale, 'field.part')}
                aria-label={`${t(locale, 'field.part')} ${index + 1}`}
                autocomplete="off"
                spellcheck="false"
                disabled={!hydrated}
              />
              <input
                class="input"
                bind:value={row.roleText}
                maxlength={ROLE_MAX}
                list={roleOptions}
                placeholder={t(locale, 'field.role')}
                aria-label={`${t(locale, 'field.role')} ${index + 1}`}
                autocomplete="off"
                disabled={!hydrated}
              />
              <button type="button" class="composition-remove" aria-label={`${t(locale, 'field.removePart')} ${index + 1}`} onclick={() => remove(index)} disabled={!hydrated}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <button type="button" class="composition-add" disabled={!hydrated || rows.length >= PARTS_MAX} onclick={add}>+ {t(locale, 'field.addPart')}</button>

      <div class="composition-formation">
        <label class="field-label" for={formationId}>{t(locale, 'field.formationOverride')}</label>
        <input
          id={formationId}
          class="input"
          bind:value={formationText}
          maxlength={FORMATION_MAX}
          list={formationOptions}
          placeholder={formationLabel(locale, suggested)}
          autocomplete="off"
          disabled={!hydrated}
        />
      </div>

      <datalist id={roleOptions}>
        {#each ROLES as role}<option value={roleLabel(locale, role)}></option>{/each}
      </datalist>
      <datalist id={formationOptions}>
        {#each FORMATIONS as formation}<option value={formationLabel(locale, formation)}></option>{/each}
      </datalist>
      <input type="hidden" name="composition" value={serialized} />
    </div>
  </details>
{/if}

<style>
  .composition { margin: 14px 0 4px; padding: 10px 0 0; border-top: 1px dashed var(--line); }
  .composition-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; list-style: none; cursor: pointer; }
  .composition-summary::-webkit-details-marker { display: none; }
  .composition-summary:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
  .composition-value { color: var(--accent); font-size: var(--text-sm); font-weight: 600; }
  .composition-value.none { color: var(--muted); font-weight: 400; }
  .composition-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .composition-tag { padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: var(--text-sm); }
  .composition-edit { margin-inline-start: auto; color: var(--muted); font-size: var(--text-sm); white-space: nowrap; }
  .chevron { display: inline-block; margin-inline-start: 4px; transition: transform 120ms ease; }
  .composition[open] .chevron { transform: rotate(180deg); }
  .composition-body { display: grid; gap: 10px; margin-top: 10px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface-subtle); }
  .composition-parts { display: grid; gap: 6px; }
  .composition-part-head, .composition-row { display: grid; grid-template-columns: minmax(72px, 110px) minmax(0, 1fr) 28px; align-items: center; gap: 8px; }
  .composition-part-head { color: var(--muted); font-size: var(--text-sm); }
  .composition-part-input { text-align: center; }
  .composition-remove { width: 28px; min-height: 32px; align-self: stretch; padding: 0; border: 0; background: none; color: var(--muted); font-size: 1.2rem; line-height: 1; cursor: pointer; }
  .composition-remove:hover { color: var(--wrong); }
  .composition-remove:disabled { cursor: default; }
  .composition-add { justify-self: start; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: var(--text-sm); cursor: pointer; }
  .composition-add:hover { text-decoration: underline; }
  .composition-add:disabled { color: var(--muted); cursor: default; text-decoration: none; }
  .composition-formation { display: grid; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
  @media (max-width: 700px) {
    .composition-part-head, .composition-row { grid-template-columns: minmax(56px, 80px) minmax(0, 1fr) 28px; }
  }
</style>
