<script lang="ts">
  // The parts tagged for the first description, with the role of each. The section stays folded
  // until someone opens it, so a record without an analysis looks like the rest of the form. The
  // parsed parts are the starting point; an editor may add, rename or remove them, type a role
  // beyond the three, and name a formation the roles cannot express.
  import { onMount, tick, untrack } from 'svelte'
  import { analyze, composeValue, formationOf, isRole, parseComposition, FORMATIONS, FORMATION_MAX, PART_MAX, PARTS_MAX, ROLES, ROLE_MAX } from '$lib/composition'
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
    partsBox?.querySelector<HTMLInputElement>('.part-card:last-of-type .part-glyph')?.focus()
  }

  function remove(index: number) {
    rows = rows.filter((_, at) => at !== index)
  }
</script>

{#if parsed}
  <details class="composition">
    <summary class="composition-summary">
      <svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg>
      <span class="field-label">{t(locale, 'field.formation')}</span>
      <span class="composition-state" aria-live="polite">
        {#if set}
          <span class="composition-value">{formationLabel(locale, resolved)}</span>
          {#each tags as tag, index (index)}
            <span class="composition-tag"><span class="tag-glyph">{tag.part}</span>{roleLabel(locale, tag.role)}</span>
          {/each}
        {:else}
          <span class="composition-value none">—</span>
        {/if}
      </span>
    </summary>

    <div class="composition-body">
      <div class="composition-parts" bind:this={partsBox}>
        {#each rows as row, index (index)}
          <div class="part-card">
            <input
              class="part-glyph"
              class:long={[...row.part.trim()].length > 2}
              bind:value={row.part}
              maxlength={PART_MAX}
              placeholder={t(locale, 'field.part')}
              aria-label={`${t(locale, 'field.part')} ${index + 1}`}
              autocomplete="off"
              spellcheck="false"
              disabled={!hydrated}
            />
            <input
              class="part-role"
              class:standard={isRole(roleFromLabel(locale, row.roleText))}
              bind:value={row.roleText}
              maxlength={ROLE_MAX}
              list={roleOptions}
              placeholder={t(locale, 'field.role')}
              aria-label={`${t(locale, 'field.role')} ${index + 1}`}
              autocomplete="off"
              disabled={!hydrated}
            />
            <button type="button" class="part-remove" aria-label={`${t(locale, 'field.removePart')} ${index + 1}`} onclick={() => remove(index)} disabled={!hydrated}>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3 3 9" /></svg>
            </button>
          </div>
        {/each}
        {#if rows.length < PARTS_MAX}
          <button type="button" class="part-add" onclick={add} disabled={!hydrated}>
            <span class="part-add-mark" aria-hidden="true">+</span>
            <span>{t(locale, 'field.addPart')}</span>
          </button>
        {/if}
      </div>

      <div class="composition-formation">
        <label class="field-label" for={formationId}>{t(locale, 'field.formationOverride')}</label>
        <input
          id={formationId}
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
  .composition { margin-block: var(--space-1) var(--space-2); }

  .composition-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); min-height: 40px; border-radius: var(--radius-sm); list-style: none; }
  .composition-summary::-webkit-details-marker { display: none; }
  .composition-summary:hover .field-label, .composition[open] .composition-summary .field-label { color: var(--accent); }
  .chevron { flex: none; width: 12px; height: 12px; margin-inline-end: calc(var(--space-1) * -1); fill: none; stroke: var(--muted); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 120ms ease; }
  .composition[open] .chevron { transform: rotate(90deg); stroke: var(--accent); }
  .composition-state { display: contents; }
  .composition-value { color: var(--ink); font-size: var(--text-sm); font-weight: 450; }
  .composition-value.none { color: var(--faint); font-weight: 400; }
  .composition-tag { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: var(--text-sm); }
  .tag-glyph { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding-inline: 4px; border-radius: var(--radius-xs); background: var(--surface-tile); color: var(--ink); font-size: var(--text-base); line-height: 1; }

  .composition-body { display: grid; gap: var(--space-4); padding: var(--space-2) 0 var(--space-2) 20px; }
  .composition-parts { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--space-2); }

  .part-card { position: relative; display: grid; grid-template-rows: 60px 40px; overflow: hidden; border: 1px solid var(--line-control); border-radius: var(--radius-md); background: var(--surface); transition: border-color 0.12s ease; }
  .part-card:hover { border-color: var(--line-strong); }
  .part-card:focus-within { border-color: var(--accent); }
  .part-card input { min-height: 0; height: 100%; padding: 0 var(--space-1); border: 0; border-radius: 0; text-align: center; }
  .part-card input:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
  .part-card .part-glyph { border-bottom: 1px solid var(--line); background: var(--surface-tile); font-size: 26px; line-height: 1; }
  .part-glyph.long { font-size: var(--text-lg); }
  .part-glyph::placeholder { color: var(--faint); font-size: var(--text-sm); }
  .part-card .part-role { background: none; font-size: var(--text-sm); }
  .part-role::-webkit-calendar-picker-indicator { display: none !important; }
  .part-role.standard { color: var(--accent); font-weight: 550; }
  .part-role::placeholder { color: var(--faint); }

  .part-remove { position: absolute; inset-block-start: 2px; inset-inline-end: 2px; display: grid; place-items: center; width: 24px; height: 24px; min-height: 0; padding: 0; border: 0; border-radius: var(--radius-xs); background: none; color: var(--faint); }
  .part-remove::before { content: ""; position: absolute; inset: -8px; }
  .part-remove svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .part-remove:not(:disabled):hover { background: var(--wrong-light); color: var(--wrong); }
  .part-remove:focus-visible { outline-offset: -2px; }

  .part-add { display: grid; place-content: center; justify-items: center; gap: 2px; min-height: 100px; padding: var(--space-2); border: 1px dashed var(--line-control); border-radius: var(--radius-md); background: none; color: var(--muted); font-size: var(--text-sm); font-weight: 500; line-height: 1.3; text-align: center; }
  .part-add-mark { font-size: 22px; font-weight: 300; line-height: 1; }
  .part-add:not(:disabled):hover { border-style: solid; border-color: var(--accent); background: var(--accent-hover); color: var(--accent); }

  .composition-formation { display: grid; grid-template-columns: auto minmax(0, 280px); justify-content: start; align-items: center; gap: var(--space-3); }
  .composition-formation .field-label { color: var(--muted); font-weight: 500; }

  @media (max-width: 700px) {
    .composition-body { padding-inline-start: 0; }
    .composition-parts { grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); }
    .composition-formation { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  }
</style>
