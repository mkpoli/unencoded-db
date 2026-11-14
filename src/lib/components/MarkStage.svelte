<script lang="ts">
  // A picture with boxes drawn over the characters, up to BOXES_MAX, in the picture's own pixels. `onchange`
  // runs after a box is added or removed; `actions` adds buttons after the marking ones.
  import type { Snippet } from 'svelte'
  import type { Box } from '$lib/picture'
  import { BOXES_MAX } from '$lib/limits'
  import { t } from '$lib/t'

  let { src, width, height, boxes = $bindable([]), marking = $bindable(false), disabled = false, onchange, actions }: {
    src: string; width: number; height: number; boxes?: Box[]; marking?: boolean; disabled?: boolean
    onchange?: (boxes: Box[]) => void; actions?: Snippet
  } = $props()

  let draft = $state<Box | null>(null)
  let drag: { x: number; y: number } | null = null
  let stage = $state<HTMLElement>()

  const point = (event: PointerEvent) => {
    const rect = stage!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function down(event: PointerEvent) {
    if (!marking || disabled || boxes.length >= BOXES_MAX) return
    event.preventDefault()
    stage!.setPointerCapture(event.pointerId)
    drag = point(event)
  }
  function move(event: PointerEvent) {
    if (!drag) return
    const at = point(event)
    draft = [Math.min(drag.x, at.x) * width, Math.min(drag.y, at.y) * height, Math.abs(at.x - drag.x) * width, Math.abs(at.y - drag.y) * height].map(Math.round) as Box
  }
  function up() {
    if (!drag) return
    drag = null
    const drawn = draft
    draft = null
    if (!drawn || drawn[2] < 4 || drawn[3] < 4) return
    boxes = [...boxes, drawn]
    onchange?.(boxes)
  }
  function remove(index: number) { boxes = boxes.filter((_, at) => at !== index); onchange?.(boxes) }
  function clear() { boxes = []; onchange?.(boxes) }
</script>

<div class="stage-wrap">
  <div class="stage" class:marking={marking && !disabled} bind:this={stage} role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
    <img {src} alt="" draggable="false" />
    {#each draft ? [...boxes, draft] : boxes as box, index}<div class="box" style:left="{box[0] / width * 100}%" style:top="{box[1] / height * 100}%" style:width="{box[2] / width * 100}%" style:height="{box[3] / height * 100}%">{#if boxes.length > 1 || draft}<span class="number">{index + 1}</span>{/if}</div>{/each}
  </div>
</div>
<div class="row">
  {#if !disabled}
    <button type="button" class="button" aria-pressed={marking} class:on={marking} onclick={() => marking = !marking}>{t('field.mark')}</button>
    {#each boxes as _, index}<button type="button" class="button" title={t('field.markRemove', { n: index + 1 })} aria-label={t('field.markRemove', { n: index + 1 })} onclick={() => remove(index)}>{index + 1} ×</button>{/each}
    {#if boxes.length > 1}<button type="button" class="button" onclick={clear}>{t('field.markClear')}</button>{/if}
  {/if}
  {@render actions?.()}
</div>
{#if marking && !disabled}<p class="hint">{t('field.markHint')}</p>{/if}

<style>
  .stage-wrap { display: flex; justify-content: center; padding: 10px; border-radius: 10px; background: var(--surface-sunken) }
  .stage { position: relative; display: inline-block; max-width: 100%; overflow: hidden; line-height: 0; user-select: none }
  .stage.marking { cursor: crosshair; touch-action: none }
  .stage img { display: block; max-width: 100%; max-height: 62vh; pointer-events: none }
  .box { position: absolute; border: 2px solid var(--mark); box-shadow: 0 0 0 9999px rgb(0 0 0 / 28%); pointer-events: none }
  .number { position: absolute; top: 0; left: 0; padding: 0 4px; background: var(--mark); color: #fff; font: 600 11px/1.5 system-ui }
  .button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light) }
</style>
