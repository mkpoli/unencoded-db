<script lang="ts">
  // The parts of the first description, each with the role it plays. The formation is shown from
  // the roles; the hidden field carries only the roles chosen for this exact description.
  import { untrack } from 'svelte'
  import { analyze, parseComposition, serializeComposition, ROLES, type Composition, type Role } from '$lib/composition'
  import { formationLabel, roleLabel } from '$lib/composition-labels'
  import { splitIds } from '$lib/ids'
  import { t, type Locale } from '$lib/i18n'

  let { ids = '', value = '', locale }: { ids?: string; value?: string; locale: Locale } = $props()

  let chosen = $state<Composition | null>(untrack(() => parseComposition(value)))
  // A failed submission brings its own value back; a click never changes the prop.
  $effect(() => { chosen = parseComposition(value) })

  const analysis = $derived(analyze(splitIds(ids)[0] ?? '', chosen))
  const serialized = $derived(analysis && analysis.parts.length > 1 ? serializeComposition(analysis.ids, analysis.roles) : '')

  function pick(index: number, role: Role) {
    if (!analysis) return
    chosen = { ids: analysis.ids, roles: analysis.roles.map((current, at) => at !== index ? current : current === role ? '' : role) }
  }
</script>

{#if analysis && analysis.parts.length > 1}
  <fieldset class="composition-field">
    <legend class="composition-legend">
      <span class="field-label">{t(locale, 'field.formation')}</span>
      <span class="composition-result" data-formation={analysis.formation} aria-live="polite">{formationLabel(locale, analysis.formation)}</span>
    </legend>
    <ul class="composition-parts">
      {#each analysis.parts as part, index (index)}
        <li class="composition-part">
          <span class="composition-char" aria-hidden="true">{part}</span>
          <span class="composition-roles" role="group" aria-label={`${t(locale, 'field.formation')} ${part}`}>
            {#each ROLES as role}
              <button
                type="button"
                class="composition-role"
                class:chosen={analysis.roles[index] === role}
                aria-pressed={analysis.roles[index] === role}
                onclick={() => pick(index, role)}
              >{roleLabel(locale, role)}</button>
            {/each}
          </span>
        </li>
      {/each}
    </ul>
    <p class="field-help">{t(locale, 'field.formationHint')}</p>
    <input type="hidden" name="composition" value={serialized} />
  </fieldset>
{/if}

<style>
  .composition-field { min-width: 0; margin: 14px 0 4px; padding: 12px 0 0; border: 0; border-top: 1px dashed var(--line); }
  .composition-legend { display: flex; align-items: baseline; gap: 10px; padding: 0; }
  .composition-result { color: var(--accent); font-size: var(--text-sm); font-weight: 600; }
  .composition-parts { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0 8px; padding: 0; list-style: none; }
  .composition-part { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 5px 7px 5px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-subtle); }
  .composition-char { font-size: 1.125rem; line-height: 1; }
  .composition-roles { display: flex; gap: 4px; }
  .composition-role { min-height: 28px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--muted); font: inherit; font-size: var(--text-sm); cursor: pointer; }
  .composition-role:hover { border-color: var(--accent); color: var(--accent); }
  .composition-role:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 1px; }
  .composition-role.chosen { border-color: var(--accent-solid); background: var(--accent-solid); color: #fff; }
  @media (max-width: 700px) {
    .composition-part { width: 100%; gap: 8px; padding-inline: 10px; border-radius: var(--radius-sm); }
    .composition-roles { margin-inline-start: auto; }
  }
</style>
