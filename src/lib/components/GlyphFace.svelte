<script lang="ts">
  // One glyph style's drawing on its plate, over the style's name.
  import type { Snippet } from 'svelte'
  import type { GlyphStyle } from '$lib/composer'
  import { t } from '$lib/t'

  let { style, children }: { style: GlyphStyle; children: Snippet } = $props()
</script>

<div class="face" data-style={style}>
  <div class="plate">{@render children()}</div>
  <span class="name">{t(`glyphStyle.${style}`)}</span>
</div>

<style>
  .face { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; width: var(--face-size, 96px) }
  .plate { display: grid; place-items: center; width: 100%; aspect-ratio: 1; border-radius: 8px; background: var(--face-plate, var(--surface-tile)); color: var(--ink) }
  .name { max-width: 100%; font-size: 12px; line-height: 1.25; color: var(--muted); text-align: center; text-wrap: balance; overflow-wrap: break-word }
</style>
