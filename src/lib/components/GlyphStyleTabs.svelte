<script lang="ts">
  // The reader's glyph style as a quiet display setting: each face writes its own name and the
  // specimen 永, so the choice is read before it is made. The radios keep one choice and one tab
  // stop, with the arrow keys moving between the faces.
  import { GLYPH_STYLES, type GlyphStyle } from '$lib/composer'
  import { t } from '$lib/t'

  let { value, onchange }: { value: GlyphStyle; onchange: (style: GlyphStyle) => void } = $props()
  const name = $props.id()
</script>

<div class="glyph-style" role="radiogroup" aria-label={t('nav.glyphStyle')}>
  {#each GLYPH_STYLES as style (style)}
    <label class="choice" class:on={value === style} data-style={style}>
      <input type="radio" {name} value={style} checked={value === style} onchange={() => onchange(style)} />
      <span class="sample" aria-hidden="true">永</span>
      <span class="name">{t(`glyphStyle.${style}`)}</span>
    </label>
  {/each}
</div>

<style>
  .glyph-style {
    display: flex; flex-wrap: wrap; align-items: center; gap: 1px;
    min-inline-size: 0; max-inline-size: 100%;
    padding: 2px; border: 1px solid var(--line); border-radius: 7px;
    background: var(--surface);
  }
  .choice {
    position: relative; display: flex; align-items: center; gap: 5px;
    min-block-size: max(26px, var(--target-size)); padding: 4px 8px; border-radius: 5px;
    color: var(--muted); cursor: pointer;
    transition: color .12s, background-color .12s;
  }
  .choice input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer }
  .choice:hover { color: var(--ink); background: var(--surface-sunken) }
  .choice:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 1px }
  .choice.on { background: var(--surface-selected); color: var(--ink) }
  .sample { font-size: 15px; line-height: 1; color: inherit }
  .name { font-size: 11px; letter-spacing: .01em }
  .choice.on .name { font-weight: 600 }
  /* The label subsets cover the names in ASCII; the specimen face carries 永 alone. */
  .choice[data-style="sans"] { font-family: Inter, "Noto Sans", var(--cjk), sans-serif }
  .choice[data-style="serif"] { font-family: var(--cjk-serif) }
  .choice[data-style="fangsong"] { font-family: "Zhuque Label", "Zhuque Specimen", var(--cjk-serif) }
  .choice[data-style="regular"] { font-family: "TW-Kai Label", "TW-Kai Specimen", var(--cjk-serif) }
  .choice[data-style="pen-writing"] { font-family: "Kureedo Label", "Kureedo Specimen", var(--cjk), sans-serif }
  @media (prefers-reduced-motion: reduce) { .choice { transition: none } }
</style>
