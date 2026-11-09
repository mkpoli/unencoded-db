<script lang="ts">
  let { image, alt = '', hint }: { image: string; alt?: string; hint: string } = $props()
  let box = $state<HTMLDivElement>()
  let start = $state<{ x: number; y: number } | null>(null)
  let x = $state(0), y = $state(0), w = $state(0), h = $state(0)

  function point(event: PointerEvent) {
    const rect = box!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }
  function down(event: PointerEvent) {
    event.preventDefault()
    start = point(event)
    x = start.x; y = start.y; w = 0; h = 0
    box?.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (!start) return
    const p = point(event)
    x = Math.min(start.x, p.x); y = Math.min(start.y, p.y)
    w = Math.abs(p.x - start.x); h = Math.abs(p.y - start.y)
  }
  function up() {
    start = null
    if (w < 1 || h < 1) { w = 0; h = 0 }
  }
</script>

<div class="crop-picker" role="group" aria-label={hint} bind:this={box} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  <img src={image} {alt} draggable="false" />
  {#if w > 0}<span class="selection" style={`left:${x}%;top:${y}%;width:${w}%;height:${h}%`}></span>{/if}
</div>
<input type="hidden" name="x" value={x} />
<input type="hidden" name="y" value={y} />
<input type="hidden" name="w" value={w} />
<input type="hidden" name="h" value={h} />
<p class="field-help">{hint}</p>

<style>
  .crop-picker { position: relative; display: block; max-width: 480px; cursor: crosshair; user-select: none; touch-action: none; }
  .crop-picker img { display: block; width: 100%; height: auto; border-radius: 6px; }
  .selection { position: absolute; border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); pointer-events: none; }
</style>
