<script lang="ts">
  // A `?` button that shows a field's full rule in a popover on click, tap or Enter. `of` is the id of the
  // field's label, which names the button. Give the field `aria-describedby` with `tipId(id)` so screen
  // readers hear the rule without opening it.
  import { t } from '$lib/t'

  let { id, of, text }: { id: string, of: string, text: string } = $props()
</script>

<script lang="ts" module>
  export const tipId = (id: string) => `${id}-tip`
</script>

<button type="button" class="toggletip" style="anchor-name: --{id}-tip" aria-labelledby="{id}-tip-name {of}" popovertarget={tipId(id)}><span id="{id}-tip-name" hidden>{t('field.details')}</span>?</button>
<span class="tip" id={tipId(id)} popover="auto" style="position-anchor: --{id}-tip">{text}</span>

<style>
  .toggletip {
    position: relative; display: inline-grid; place-items: center; inline-size: 18px; block-size: 18px; margin-inline-start: 4px; padding: 0;
    border: 1px solid var(--line-strong); border-radius: 50%; background: none; color: var(--muted);
    font: inherit; font-size: 11px; font-weight: 600; line-height: 1; vertical-align: 1px; cursor: pointer;
  }
  .toggletip:hover, .toggletip:focus-visible { border-color: var(--accent); color: var(--accent) }
  /* The circle stays small; the area that takes a tap grows to the shared target size. */
  .toggletip::before { content: ''; position: absolute; inset: min(0px, calc((18px - var(--target-size)) / 2)) }
  .tip {
    max-inline-size: min(320px, calc(100vw - 32px)); padding: 8px 10px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: inherit;
    font-size: 12.5px; line-height: 1.5; box-shadow: 0 6px 20px rgb(0 0 0 / 14%);
  }
  @supports (position-area: bottom) {
    .tip { inset: auto; margin: 6px 0 0; position-area: bottom span-right; position-try-fallbacks: flip-inline, flip-block, flip-block flip-inline; position-try-order: most-inline-size }
  }
</style>
