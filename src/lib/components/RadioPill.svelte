<script lang="ts">
  // One choice among several that exclude each other: a native radio drawn as a pill.
  let { name, value, label, checked = false, onchange }: { name: string; value: string; label: string; checked?: boolean; onchange?: () => void } = $props()
</script>

<label class="pill">
  <input type="radio" {name} {value} {checked} {onchange} />
  <span class="dot" aria-hidden="true"></span><span class="text">{label}</span>
</label>

<style>
  .pill { position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px 0 8px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); cursor: pointer }
  .pill:hover { border-color: var(--muted) }
  .pill input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer }
  .pill:has(input:focus-visible) { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .dot { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid var(--line-strong); border-radius: 50%; background: var(--surface) }
  .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: #fff; opacity: 0; transition: opacity .12s ease }
  .pill:has(input:checked) { border-color: var(--accent); background: var(--accent-light) }
  .pill:has(input:checked) .dot { border-color: var(--accent); background: var(--accent) }
  .pill:has(input:checked) .dot::after { opacity: 1 }
  @media (prefers-reduced-motion: reduce) { .dot::after { transition: none } }
</style>
