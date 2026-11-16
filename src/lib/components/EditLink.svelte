<script lang="ts">
  // A pencil beside a field of the record card, or a text link in its place while the field is empty.
  // It leads to the field's place in the edit form (`#edit-<field>`); the page opens the form and focuses
  // the field on click, and without scripts the browser opens the form around the fragment itself.
  import { t } from '$lib/t'

  let { field, name, add = false }: { field: string; name: string; add?: boolean } = $props()
</script>

{#if add}
  <a class="text-link add" href="#edit-{field}" data-edit={field}>{name}</a>
{:else}
  <!-- Pencil: Lucide (ISC license), https://lucide.dev/icons/pencil -->
  <a class="pencil" href="#edit-{field}" data-edit={field} aria-label={t('entry.editField', { field: name })} title={t('entry.editField', { field: name })}>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" /></svg>
  </a>
{/if}

<style>
  .pencil { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 24px; height: 24px; border-radius: 6px; color: var(--muted); vertical-align: middle }
  .pencil:hover, .pencil:focus-visible { color: var(--accent); background: var(--accent-light) }
  .add { font-size: 13px }
</style>
