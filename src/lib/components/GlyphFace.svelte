<script lang="ts">
  // One glyph style's drawing on its plate, over the style's name. Given `onpick`, the name is a toggle
  // button among the faces, and a face that is not the current one takes a click anywhere on it.
  import type { Snippet } from 'svelte'
  import type { GlyphStyle } from '$lib/composer'
  import { t } from '$lib/t'

  let { style, current = false, onpick, children }: { style: GlyphStyle; current?: boolean; onpick?: (style: GlyphStyle) => void; children: Snippet } = $props()
</script>

<div class="face" class:current class:pick={Boolean(onpick) && !current} data-style={style}>
  <div class="plate">{@render children()}</div>
  {#if onpick}<button type="button" class="name" aria-pressed={current} onclick={() => onpick(style)}>{t(`glyphStyle.${style}`)}</button>
  {:else}<span class="name">{t(`glyphStyle.${style}`)}</span>{/if}
</div>

<style>
  .face { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; width: var(--face-size, 96px) }
  .plate { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border-radius: 8px; background: var(--face-plate, var(--surface-tile)); color: var(--ink) }
  .name { max-width: 100%; font-size: 12px; line-height: 1.25; color: var(--muted); text-align: center; text-wrap: balance; overflow-wrap: break-word }
  button.name { padding: 0 2px; border: 0; border-radius: 4px; background: none; font: inherit; font-size: 12px; cursor: pointer }
  .current .name { color: var(--ink); font-weight: 600; cursor: default }
  /* A face that is not the current one is one target: the name's button covers the whole face. */
  .pick .name::after { content: ''; position: absolute; inset: 0; border-radius: 8px }
  .pick .name:focus-visible { outline: none }
  .pick:has(.name:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: 8px }
  .pick:hover .plate { box-shadow: inset 0 0 0 1px var(--line-strong) }
  .pick:hover .name { color: var(--ink) }
</style>
