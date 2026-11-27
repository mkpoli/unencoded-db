<script lang="ts">
  // A `?` button that shows a field's full rule in a popover on click, tap or Enter. Give the field
  // `aria-describedby` with `tipId(id)` so screen readers hear the rule without opening it.
  import { t } from '$lib/t'

  let { id, text }: { id: string, text: string } = $props()
</script>

<script lang="ts" module>
  export const tipId = (id: string) => `${id}-tip`
</script>

<button type="button" class="toggletip" style="anchor-name: --{id}-tip" aria-label={t('field.details')} popovertarget={tipId(id)}>?</button>
<span class="tip" id={tipId(id)} popover="auto" style="position-anchor: --{id}-tip">{text}</span>

<style>
  .toggletip {
    display: inline-grid; place-items: center; inline-size: 18px; block-size: 18px; margin-inline-start: 4px; padding: 0;
    border: 1px solid var(--line-strong); border-radius: 50%; background: none; color: var(--muted);
    font: inherit; font-size: 11px; font-weight: 600; line-height: 1; vertical-align: 1px; cursor: pointer;
  }
  .toggletip:hover, .toggletip:focus-visible { border-color: var(--accent); color: var(--accent) }
  .tip {
    max-inline-size: min(320px, calc(100vw - 32px)); margin: 0; padding: 8px 10px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: inherit;
    font-size: 12.5px; line-height: 1.5; box-shadow: 0 6px 20px rgb(0 0 0 / 14%);
  }
  @supports (position-area: bottom) {
    .tip { position-area: bottom span-right; position-try-fallbacks: bottom span-left, flip-block, top span-left; position-try-order: most-inline-size; margin-block-start: 6px }
  }
</style>
