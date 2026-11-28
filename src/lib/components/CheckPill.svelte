<script lang="ts">
  // One choice among several that can be taken together: a native checkbox drawn as a pill.
  import type { TagType } from '$lib/tags'

  let { name, value, label, checked = false, strong = false, implied = false, tagType, title, onchange }: {
    name?: string; value: string; label: string; checked?: boolean; strong?: boolean; implied?: boolean; tagType?: TagType; title?: string; onchange?: (checked: boolean) => void
  } = $props()
</script>

<label class="pill" class:strong class:implied data-tag-type={tagType} title={title || undefined}>
  <input type="checkbox" {name} {value} {checked} onchange={event => onchange?.(event.currentTarget.checked)} />
  <span class="box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span><span class="text">{label}</span>
</label>

<style>
  .pill { position: relative; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; min-block-size: max(40px, var(--target-size)); padding: 0 10px 0 6px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); cursor: pointer }
  .pill:hover { border-color: var(--muted) }
  .pill input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer }
  .pill:has(input:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .box { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--surface) }
  .box svg { width: 12px; height: 12px; opacity: 0; transition: opacity .12s ease }
  .text { min-inline-size: 0; overflow-wrap: anywhere }
  .pill[data-tag-type=script] { --pill-ink: var(--tag-script-ink); --pill-bg: var(--tag-script-bg); --pill-line: var(--tag-script-line) }
  .pill[data-tag-type=region] { --pill-ink: var(--tag-region-ink); --pill-bg: var(--tag-region-bg); --pill-line: var(--tag-region-line) }
  .pill[data-tag-type=language] { --pill-ink: var(--tag-language-ink); --pill-bg: var(--tag-language-bg); --pill-line: var(--tag-language-line) }
  .pill[data-tag-type=form] { --pill-ink: var(--tag-form-ink); --pill-bg: var(--tag-form-bg); --pill-line: var(--tag-form-line) }
  .pill[data-tag-type=domain] { --pill-ink: var(--tag-domain-ink); --pill-bg: var(--tag-domain-bg); --pill-line: var(--tag-domain-line) }
  .pill[data-tag-type=meta] { --pill-ink: var(--tag-meta-ink); --pill-bg: var(--tag-meta-bg); --pill-line: var(--tag-meta-line) }
  .pill[data-tag-type=general] { --pill-ink: var(--accent); --pill-bg: var(--accent-light); --pill-line: var(--accent) }
  .pill[data-tag-type]:not([data-tag-type=general]) { border-color: color-mix(in srgb, var(--pill-line) 55%, var(--line)) }
  .pill.implied:not(:has(input:checked)) { border-style: dashed; border-color: var(--pill-line, var(--accent)); background: var(--pill-bg, var(--accent-light)); color: var(--pill-ink, var(--ink)) }
  .pill:has(input:checked) { border-color: var(--pill-line, var(--accent)); background: var(--pill-bg, var(--accent-light)); color: var(--pill-ink, inherit) }
  .pill:has(input:checked) .box { border-color: var(--pill-ink, var(--accent)); background: var(--pill-ink, var(--accent)) }
  .pill:has(input:checked) .box svg { opacity: 1 }
  .strong { font-weight: 500 }
  @media (prefers-reduced-motion: reduce) { .box svg { transition: none } }
</style>
