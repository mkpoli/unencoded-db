<script lang="ts">
  // One choice among several that can be taken together: a native checkbox drawn as a pill.
  let { name, value, label, checked = false, strong = false, onchange }: {
    name?: string; value: string; label: string; checked?: boolean; strong?: boolean; onchange?: (checked: boolean) => void
  } = $props()
</script>

<label class="pill" class:strong>
  <input type="checkbox" {name} {value} {checked} onchange={event => onchange?.(event.currentTarget.checked)} />
  <span class="box" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 6.4 4.6 9 10.2 2.8" /></svg></span><span class="text" title={label}>{label}</span>
</label>

<style>
  .pill { position: relative; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; min-height: 40px; padding: 0 10px 0 6px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); cursor: pointer }
  .pill:hover { border-color: var(--muted) }
  .pill input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer }
  .pill:has(input:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .box { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--surface) }
  .box svg { width: 12px; height: 12px; opacity: 0; transition: opacity .12s ease }
  .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .pill:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .pill:has(input:checked) .box { border-color: var(--accent); background: var(--accent) }
  .pill:has(input:checked) .box svg { opacity: 1 }
  .strong { font-weight: 500 }
  @media (prefers-reduced-motion: reduce) { .box svg { transition: none } }
</style>
