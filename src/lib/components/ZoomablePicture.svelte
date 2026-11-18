<script lang="ts">
  // A picture that opens at the size it fits its frame and can be enlarged and moved. The frame stays
  // put while the picture grows inside it, so a mark drawn over the picture keeps its place at any scale.
  import type { Snippet } from 'svelte'
  import { aroundPoint, clampZoom, confinePan, ZOOM_MAX, ZOOM_STEP, type Pan } from '$lib/zoom'
  import { t } from '$lib/t'

  let {
    src, alt, width, height, href = null, loading = 'lazy',
    image = $bindable(), zoom = $bindable(1), frame = $bindable(), pan = $bindable<Pan>({ x: 0, y: 0 }),
    disabled = false, marking = false,
    onstart, onmove, onend, onload, overlay,
  }: {
    src: string; alt: string; width?: number; height?: number; href?: string | null
    loading?: 'eager' | 'lazy'
    image?: HTMLImageElement
    zoom?: number
    frame?: HTMLElement
    pan?: Pan
    disabled?: boolean
    marking?: boolean
    onstart?: (event: PointerEvent) => boolean
    onmove?: (event: PointerEvent) => void
    onend?: () => void
    onload?: () => void
    overlay?: Snippet
  } = $props()

  let drag = $state<{ id: number; x: number; y: number; pan: Pan; moved: boolean } | null>(null)
  let marked: number | null = null
  let moved = false

  const pictureSize = () => ({ width: image?.offsetWidth ?? 0, height: image?.offsetHeight ?? 0 })
  const frameSize = () => ({ width: frame?.clientWidth ?? 0, height: frame?.clientHeight ?? 0 })
  const settled = (next: Pan, scale = zoom) => confinePan(next, scale, pictureSize(), frameSize())

  function zoomBy(factor: number, at: Pan = { x: 0, y: 0 }) {
    if (disabled) return
    const next = clampZoom(zoom * factor)
    if (next === zoom) return
    pan = settled(aroundPoint(pan, at, zoom, next), next)
    zoom = next
  }
  function reset() {
    if (disabled) return
    zoom = 1; pan = { x: 0, y: 0 }
  }
  function pointAt(event: { clientX: number; clientY: number }): Pan {
    const rect = frame!.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  function down(event: PointerEvent) {
    if (disabled || event.button !== 0 || (event.target as Element).closest('.tools')) return
    moved = false
    if (marking) {
      if (!onstart?.(event)) return
      event.preventDefault()
      marked = event.pointerId
      frame!.setPointerCapture(event.pointerId)
      return
    }
    if (zoom <= 1) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan, moved: false }
    frame!.focus({ preventScroll: true })
    frame!.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent) {
    if (marked === event.pointerId) { onmove?.(event); return }
    if (!drag || drag.id !== event.pointerId) return
    const x = drag.pan.x + event.clientX - drag.x, y = drag.pan.y + event.clientY - drag.y
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) drag.moved = true
    pan = settled({ x, y })
    moved = drag.moved
  }
  function up(event: PointerEvent) {
    if (marked === event.pointerId) {
      marked = null
      onend?.()
      if (frame?.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId)
    }
    if (drag?.id === event.pointerId) {
      moved = drag.moved
      drag = null
      if (frame?.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId)
    }
  }
  function clicked(event: MouseEvent) {
    if (!moved) return
    moved = false
    event.preventDefault()
  }
  function wheel(event: WheelEvent) {
    if (disabled) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      zoomBy(Math.exp(-event.deltaY * 0.002), pointAt(event))
    } else if (zoom > 1) {
      event.preventDefault()
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame?.clientHeight ?? 1 : 1
      pan = settled({ x: pan.x - event.deltaX * step, y: pan.y - event.deltaY * step })
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.target !== frame || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(ZOOM_STEP) }
    else if (event.key === '-') { event.preventDefault(); zoomBy(1 / ZOOM_STEP) }
    else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); reset() }
    else {
      const arrows: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      const direction = arrows[event.key]
      if (!direction || zoom <= 1) return
      event.preventDefault()
      const distance = event.shiftKey ? 96 : 32
      pan = settled({ x: pan.x + direction[0] * distance, y: pan.y + direction[1] * distance })
    }
  }
  function loaded() {
    onload?.()
    pan = settled(pan)
  }

  $effect(() => {
    if (!frame) return
    const observer = new ResizeObserver(() => { pan = settled(pan) })
    observer.observe(frame)
    return () => observer.disconnect()
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="zoom" bind:this={frame} class:marking class:panning={!marking && zoom > 1} class:dragging={Boolean(drag)}
     role="group" aria-label={t('field.imageZoom')} tabindex="0"
     onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onkeydown={keydown} onwheel={wheel}>
  {#if href}
    <a class="picture" {href} draggable="false" onclick={clicked}>
      <div class="plane" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})" style:--inv={1 / zoom}>
        <img bind:this={image} {src} {alt} {width} {height} {loading} draggable="false" onload={loaded} />
        {@render overlay?.()}
      </div>
    </a>
  {:else}
    <div class="plane" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})" style:--inv={1 / zoom}>
      <img bind:this={image} {src} {alt} {width} {height} {loading} draggable="false" onload={loaded} />
      {@render overlay?.()}
    </div>
  {/if}
  <div class="tools">
    <button type="button" class="out" aria-label={t('field.imageZoomOut')} title={t('field.imageZoomOut')} disabled={disabled || zoom <= 1} onclick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
    <button type="button" class="fit" aria-label={t('field.imageZoomFit')} title={t('field.imageZoomFit')} disabled={disabled} onclick={reset}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M9 9h6v6H9z"/></svg>
    </button>
    <button type="button" class="in" aria-label={t('field.imageZoomIn')} title={t('field.imageZoomIn')} disabled={disabled || zoom >= ZOOM_MAX} onclick={() => zoomBy(ZOOM_STEP)}>+</button>
  </div>
</div>

<style>
  .zoom { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; max-width: 100%; overflow: hidden; outline-offset: 2px; touch-action: pan-y; user-select: none }
  .zoom.marking { cursor: crosshair; touch-action: none }
  .zoom.panning { cursor: grab; touch-action: none }
  .zoom.dragging { cursor: grabbing }
  .zoom:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: -3px }
  .picture { display: flex; justify-content: center; width: 100%; max-width: 100%; line-height: 0 }
  .plane { position: relative; display: inline-block; max-width: 100%; line-height: 0; transform-origin: center center; will-change: transform }
  .plane img { display: block; width: auto; height: auto; max-width: 100%; max-height: var(--picture-height, 65vh); pointer-events: none; -webkit-user-drag: none }
  .tools { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: light-dark(rgb(255 255 255 / 94%), rgb(27 27 31 / 94%)); box-shadow: 0 2px 12px light-dark(rgb(0 0 0 / 12%), rgb(0 0 0 / 40%)); cursor: default }
  .tools button { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--ink); font-size: 20px; line-height: 1; cursor: pointer }
  .tools button:hover:enabled { background: var(--accent-light) }
  .tools button:disabled { opacity: .35; cursor: default }
  .tools .fit { width: 34px }
  .tools svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5 }
  @media (max-width: 500px) { .tools { right: 6px; bottom: 6px } .tools button { width: 28px; height: 28px } .tools .fit { width: 32px } }
</style>
