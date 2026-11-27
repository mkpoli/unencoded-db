<script lang="ts">
  // A picture with boxes drawn over the characters, up to BOXES_MAX, in the picture's own pixels. It can
  // be enlarged and moved while marking, so a character on a whole page can be found and boxed. Box
  // numbers sit outside the box, clear of the character they name. One scrim dims the picture around
  // the boxes, however many there are. `onchange` runs after a box is added
  // or removed; `actions` adds buttons after the marking ones.
  import type { Snippet } from 'svelte'
  import type { Box } from '$lib/picture'
  import { BOXES_MAX } from '$lib/limits'
  import { t } from '$lib/t'
  import type { Pan } from '$lib/zoom'
  import ZoomablePicture from './ZoomablePicture.svelte'

  let { src, width, height, boxes = $bindable([]), marking = $bindable(false), disabled = false, onchange, actions }: {
    src: string; width: number; height: number; boxes?: Box[]; marking?: boolean; disabled?: boolean
    onchange?: (boxes: Box[]) => void; actions?: Snippet
  } = $props()

  let draft = $state<Box | null>(null)
  let drag: { x: number; y: number } | null = null
  let image = $state<HTMLImageElement>()
  let frame = $state<HTMLElement>()
  let zoom = $state(1)
  let pan = $state<Pan>({ x: 0, y: 0 })
  let ready = $state(false)
  const maskId = $props.id()

  const point = (event: PointerEvent) => {
    const rect = image!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function down(event: PointerEvent) {
    if (!marking || disabled || boxes.length >= BOXES_MAX) return false
    drag = point(event)
    draft = null
    return true
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

  // How much of the picture one screen pixel covers, so a number can go on the side with room for it.
  const measured = $derived(image && (ready || image.complete))
  const pxX = $derived(measured ? image!.offsetWidth * zoom / width : 0)
  const pxY = $derived(measured ? image!.offsetHeight * zoom / height : 0)
  const room = (box: Box) => {
    const left = (frame?.clientWidth ?? 0) / 2 - (image?.offsetWidth ?? 0) * zoom / 2 + pan.x + box[0] * pxX
    const top = (frame?.clientHeight ?? 0) / 2 - (image?.offsetHeight ?? 0) * zoom / 2 + pan.y + box[1] * pxY
    return {
      above: top,
      below: (frame?.clientHeight ?? 0) - (top + box[3] * pxY),
      right: (frame?.clientWidth ?? 0) - left,
      left: left + box[2] * pxX,
    }
  }
</script>

<div class="stage-wrap">
  <ZoomablePicture {src} {width} {height} alt="" bind:image bind:frame bind:zoom bind:pan marking={marking && !disabled} {disabled}
    onstart={down} onmove={move} onend={up} onload={() => ready = true}>
    {#snippet overlay()}
      {@const drawn = draft ? [...boxes, draft] : boxes}
      {#if drawn.length}
        <svg class="scrim" viewBox="0 0 {width} {height}" preserveAspectRatio="none" aria-hidden="true">
          <mask id={maskId}>
            <rect {width} {height} fill="#fff" />
            {#each drawn as box}<rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="#000" />{/each}
          </mask>
          <rect {width} {height} mask="url(#{maskId})" />
        </svg>
      {/if}
      {#each drawn as box, index}
        {@const space = room(box)}
        {@const numbered = boxes.length > 1 || draft}
        <div class="box" style:left="{box[0] / width * 100}%" style:top="{box[1] / height * 100}%" style:width="{box[2] / width * 100}%" style:height="{box[3] / height * 100}%">
          {#if numbered}<span class="number" class:below={space.above < 18 && space.above < space.below} class:right={space.right < 30 && space.right < space.left}>{index + 1}</span>{/if}
        </div>
      {/each}
    {/snippet}
  </ZoomablePicture>
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
  .stage-wrap { --picture-height: 62vh; display: flex; justify-content: center; padding: 10px; border-radius: 10px; background: var(--surface-sunken) }
  .box { position: absolute; border: calc(2px * var(--inv, 1)) solid var(--mark); pointer-events: none }
  .scrim { position: absolute; inset: 0; width: 100%; height: 100%; fill: rgb(0 0 0 / 28%); pointer-events: none }
  .number { position: absolute; bottom: calc(100% + 2px * var(--inv, 1)); left: calc(-2px * var(--inv, 1)); padding: 0 calc(4px * var(--inv, 1)); border-radius: calc(2px * var(--inv, 1)); background: var(--mark); color: #fff; font-size: calc(11px * var(--inv, 1)); font-weight: 600; line-height: 1.5; white-space: nowrap }
  .number.below { bottom: auto; top: calc(100% + 2px * var(--inv, 1)) }
  .number.right { left: auto; right: calc(-2px * var(--inv, 1)) }
  @supports (height: 1dvh) { .stage-wrap { --picture-height: 62dvh } }
  .button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light) }
</style>
