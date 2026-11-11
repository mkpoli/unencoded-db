<script lang="ts">
  // The parts tagged for the first description, with the role of each. The parsed parts are the
  // starting point; an editor may add, rename or remove them, type a role beyond the three, and
  // name a formation the roles cannot express. The hidden field carries the chosen codes as JSON.
  import { tick, untrack } from 'svelte'
  import { analyze, composeValue, formationOf, parseComposition, FORMATIONS, FORMATION_MAX, PART_MAX, PARTS_MAX, ROLES, ROLE_MAX } from '$lib/composition'
  import { formationFromLabel, formationLabel, roleFromLabel, roleLabel } from '$lib/composition-labels'
  import { splitIds } from '$lib/ids'
  import { t, type Locale } from '$lib/i18n'

  type Row = { part: string; roleText: string }

  let { ids = '', value = '', locale }: { ids?: string; value?: string; locale: Locale } = $props()

  /** The rows and formation a stored value gives, for the description it was chosen for. */
  function load(storedValue: string, sequence: string, at: Locale) {
    const stored = parseComposition(storedValue)
    const base = analyze(sequence, stored)
    if (!base) return { rows: [] as Row[], formation: '' }
    return {
      rows: base.parts.map(part => ({ part: part.part, roleText: part.role ? roleLabel(at, part.role) : '' })),
      formation: stored?.ids === sequence && stored.formation ? formationLabel(at, stored.formation) : '',
    }
  }

  const primary = $derived(splitIds(ids)[0] ?? '')
  const parsed = $derived(analyze(primary, null))
  const initial = untrack(() => load(value, primary, locale))
  let rows = $state<Row[]>(initial.rows)
  let formationText = $state(initial.formation)

  // A failed submission returns its own value; a changed description starts from the new parts.
  $effect(() => {
    const next = load(value, primary, locale)
    rows = next.rows
    formationText = next.formation
  })

  const filled = $derived(rows.filter(row => row.part.trim()))
  const roleCodes = $derived(filled.map(row => roleFromLabel(locale, row.roleText)))
  const derivedFormation = $derived(formationOf(roleCodes))
  const suggested = $derived(derivedFormation ?? (parsed && parsed.parts.length === 0 && !filled.length ? 'single' : 'unknown'))
  const override = $derived(formationText.trim() ? formationFromLabel(locale, formationText) : '')
  const resolved = $derived(override || suggested)
  const serialized = $derived(composeValue(primary, filled.map(row => row.part.trim()), roleCodes, override || null))

  async function add() {
    if (rows.length >= PARTS_MAX) return
    rows = [...rows, { part: '', roleText: '' }]
    await tick()
    const inputs = document.querySelectorAll<HTMLInputElement>('.composition-part-input')
    inputs[inputs.length - 1]?.focus()
  }

  function remove(index: number) {
    rows = rows.filter((_, at) => at !== index)
  }
</script>

{#if parsed}
  <fieldset class="composition-field" aria-describedby="composition-hint">
    <legend class="composition-legend">
      <span class="field-label">{t(locale, 'field.formation')}</span>
      <span class="composition-result" aria-live="polite">{formationLabel(locale, resolved)}</span>
    </legend>
    <p class="field-help" id="composition-hint">{t(locale, 'field.formationHint')}</p>

    {#if rows.length}
      <div class="composition-parts">
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
            />
            <input
              class="input"
              bind:value={row.roleText}
              maxlength={ROLE_MAX}
              list="composition-roles"
              placeholder={t(locale, 'field.role')}
              aria-label={`${t(locale, 'field.role')} ${index + 1}`}
              autocomplete="off"
            />
            <button type="button" class="composition-remove" aria-label={`${t(locale, 'field.removePart')} ${index + 1}`} onclick={() => remove(index)}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div>
      <button type="button" class="secondary composition-add" disabled={rows.length >= PARTS_MAX} onclick={add}>{t(locale, 'field.addPart')}</button>
    </div>

    <div class="composition-formation">
      <label class="field-label" for="composition-formation">{t(locale, 'field.formationOverride')}</label>
      <input
        id="composition-formation"
        class="input"
        bind:value={formationText}
        maxlength={FORMATION_MAX}
        list="composition-formations"
        placeholder={formationLabel(locale, suggested)}
        autocomplete="off"
      />
      <p class="field-help">{t(locale, 'field.formationDerived', { formation: formationLabel(locale, suggested) })}</p>
    </div>

    <datalist id="composition-roles">
      {#each ROLES as role}<option value={roleLabel(locale, role)}></option>{/each}
    </datalist>
    <datalist id="composition-formations">
      {#each FORMATIONS as formation}<option value={formationLabel(locale, formation)}></option>{/each}
    </datalist>
    <input type="hidden" name="composition" value={serialized} />
  </fieldset>
{/if}

<style>
  .composition-field { display: grid; gap: 10px; min-width: 0; margin: 14px 0 4px; padding: 12px 0 0; border: 0; border-top: 1px dashed var(--line); }
  .composition-legend { display: flex; align-items: baseline; gap: 10px; padding: 0; }
  .composition-result { color: var(--accent); font-size: var(--text-sm); font-weight: 600; }
  .composition-parts { display: grid; gap: 6px; }
  .composition-part-head, .composition-row { display: grid; grid-template-columns: minmax(72px, 110px) minmax(0, 1fr) 32px; align-items: center; gap: 8px; }
  .composition-part-head { color: var(--muted); font-size: var(--text-sm); }
  .composition-part-input { text-align: center; }
  .composition-remove { width: 32px; height: auto; min-height: 32px; align-self: stretch; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); font-size: 1.1rem; line-height: 1; cursor: pointer; }
  .composition-remove:hover { border-color: var(--wrong); color: var(--wrong); }
  .composition-add { justify-self: start; }
  .composition-formation { display: grid; gap: 6px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--line); }
  @media (max-width: 700px) {
    .composition-part-head, .composition-row { grid-template-columns: minmax(56px, 80px) minmax(0, 1fr) 32px; }
  }
</style>
