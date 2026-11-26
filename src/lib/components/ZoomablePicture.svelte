<script lang="ts">
  // A picture that opens at the size it fits its frame and can be enlarged and moved. The frame stays
  // put while the picture grows inside it, so a mark drawn over the picture keeps its place at any scale.
  import type { Snippet } from 'svelte'
  import type { Box } from '$lib/picture'
  import { aroundPoint, clampZoom, confinePan, focusBox, maxZoomFor, ZOOM_MAX, ZOOM_STEP, type Pan, type Size } from '$lib/zoom'
  import { t } from '$lib/t'

  let {
    src, alt, width, height, href = null, loading = 'lazy',
    image = $bindable(), zoom = $bindable(1), maxZoom = $bindable(ZOOM_MAX), frame = $bindable(), pan = $bindable<Pan>({ x: 0, y: 0 }),
    disabled = false, marking = false, fill = false, wheelZoom = false, hideTools = false,
    onstart, onmove, onend, onload, overlay,
  }: {
    src: string; alt: string; width?: number; height?: number; href?: string | null
    loading?: 'eager' | 'lazy'
    image?: HTMLImageElement
    zoom?: number
    maxZoom?: number
    frame?: HTMLElement
    pan?: Pan
    disabled?: boolean
    marking?: boolean
    fill?: boolean
    wheelZoom?: boolean
    hideTools?: boolean
    onstart?: (event: PointerEvent) => boolean
    onmove?: (event: PointerEvent) => void
    onend?: () => void
    onload?: () => void
    overlay?: Snippet
  } = $props()

  let drag = $state<{ id: number; x: number; y: number; pan: Pan; moved: boolean } | null>(null)
  let pinch: { distance: number; midpoint: Pan; zoom: number; pan: Pan } | null = null
  const pointers = new Map<number, { x: number; y: number }>()
  let marked: number | null = null
  let moved = false

  const pictureSize = (): Size => ({ width: image?.offsetWidth ?? 0, height: image?.offsetHeight ?? 0 })
  const naturalSize = (): Size => ({ width: image?.naturalWidth || width || 0, height: image?.naturalHeight || height || 0 })
  const frameSize = (): Size => ({ width: frame?.clientWidth ?? 0, height: frame?.clientHeight ?? 0 })
  const settled = (next: Pan, scale = zoom) => confinePan(next, scale, pictureSize(), frameSize())

  function syncMetrics() {
    const fitted = pictureSize()
    const ceiling = maxZoomFor(naturalSize(), fitted)
    if (ceiling !== maxZoom) maxZoom = ceiling
    if (zoom > ceiling) zoom = ceiling
    const next = settled(pan, zoom)
    if (next.x !== pan.x || next.y !== pan.y) pan = next
  }

  export function zoomBy(factor: number, at: Pan = { x: 0, y: 0 }) {
    if (disabled) return
    const next = clampZoom(zoom * factor, maxZoom)
    if (next === zoom) return
    pan = settled(aroundPoint(pan, at, zoom, next), next)
    zoom = next
  }

  export function reset() {
    if (disabled) return
    zoom = 1
    pan = { x: 0, y: 0 }
  }

  export function focusOn(box: Box, natural: Size = naturalSize()) {
    if (disabled) return
    syncMetrics()
    const target = focusBox(box, natural, pictureSize(), frameSize(), maxZoom)
    zoom = target.zoom
    pan = target.pan
  }

  function pointAt(event: { clientX: number; clientY: number }): Pan {
    const rect = frame!.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  function pairGeometry() {
    const [a, b] = [...pointers.values()]
    const dx = b.x - a.x, dy = b.y - a.y
    const mid = pointAt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
    return { distance: Math.hypot(dx, dy) || 1, midpoint: mid }
  }

  function down(event: PointerEvent) {
    if (disabled || (event.target as Element).closest('.tools')) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    moved = false
    if (marking) {
      if (!onstart?.(event)) return
      event.preventDefault()
      marked = event.pointerId
      frame!.setPointerCapture(event.pointerId)
      return
    }
    if (event.pointerType !== 'mouse') {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size === 2) {
        drag = null
        const pair = pairGeometry()
        pinch = { distance: pair.distance, midpoint: pair.midpoint, zoom, pan }
        frame!.setPointerCapture(event.pointerId)
        return
      }
    }
    if (zoom <= 1) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan, moved: false }
    frame!.focus({ preventScroll: true })
    frame!.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent) {
    if (marked === event.pointerId) { onmove?.(event); return }
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch && pointers.size === 2) {
        const pair = pairGeometry()
        const next = clampZoom(pinch.zoom * (pair.distance / pinch.distance), maxZoom)
        const anchored = aroundPoint(pinch.pan, pinch.midpoint, pinch.zoom, next)
        pan = settled({ x: anchored.x + (pair.midpoint.x - pinch.midpoint.x), y: anchored.y + (pair.midpoint.y - pinch.midpoint.y) }, next)
        zoom = next
        moved = true
        return
      }
    }
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
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = null
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

  function dblclick(event: MouseEvent) {
    if (disabled || marking || (event.target as Element).closest('.tools')) return
    if (zoom > 1.05) { reset(); return }
    const fitted = pictureSize(), natural = naturalSize()
    const native = fitted.width > 0 && natural.width > 0 ? Math.max(natural.width / fitted.width, natural.height / fitted.height) : 2.5
    const target = clampZoom(Math.max(2.5, Math.min(4, native)), maxZoom)
    zoomBy(target / zoom, pointAt(event))
  }

  function wheel(event: WheelEvent) {
    if (disabled) return
    if (event.ctrlKey || event.metaKey || wheelZoom) {
      event.preventDefault()
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame?.clientHeight ?? 1 : 1
      const delta = Math.max(-180, Math.min(180, event.deltaY * factor))
      zoomBy(Math.exp(-delta * 0.0025), pointAt(event))
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
    syncMetrics()
  }

  $effect(() => {
    if (!frame) return
    // The observer reports once on observe, which measures the picture as it first stands.
    const observer = new ResizeObserver(() => syncMetrics())
    observer.observe(frame)
    if (image) observer.observe(image)
    return () => observer.disconnect()
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="zoom" bind:this={frame} class:fill class:marking class:panning={!marking && zoom > 1} class:dragging={Boolean(drag)}
     role="group" aria-label={t('field.imageZoom')} tabindex="0"
     onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} ondblclick={dblclick} onkeydown={keydown} onwheel={wheel}>
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
  {#if !hideTools}
    <div class="tools">
      <button type="button" class="out" aria-label={t('field.imageZoomOut')} title={t('field.imageZoomOut')} disabled={disabled || zoom <= 1} onclick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
      <button type="button" class="fit" aria-label={t('field.imageZoomFit')} title={t('field.imageZoomFit')} disabled={disabled} onclick={reset}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M9 9h6v6H9z"/></svg>
      </button>
      <button type="button" class="in" aria-label={t('field.imageZoomIn')} title={t('field.imageZoomIn')} disabled={disabled || zoom >= maxZoom} onclick={() => zoomBy(ZOOM_STEP)}>+</button>
    </div>
  {/if}
</div>

<style>
  .zoom { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; max-width: 100%; overflow: hidden; outline-offset: 2px; touch-action: pan-y; user-select: none }
  .zoom.fill { height: 100%; min-height: 0; container-type: size; touch-action: none }
  .zoom.marking { cursor: crosshair; touch-action: none }
  .zoom.panning { cursor: grab; touch-action: none }
  .zoom.dragging { cursor: grabbing }
  .zoom:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: -3px }
  .picture { display: flex; justify-content: center; width: 100%; max-width: 100%; line-height: 0 }
  .plane { position: relative; display: inline-block; max-width: 100%; line-height: 0; transform-origin: center center; will-change: transform }
  .plane img { display: block; width: auto; height: auto; max-width: 100%; max-height: var(--picture-height, 65vh); pointer-events: none; -webkit-user-drag: none }
  @supports (height: 1dvh) { .plane img { max-height: var(--picture-height, 65dvh) } }
  .zoom.fill .plane { max-width: none }
  .zoom.fill .plane img { max-width: 100cqw; max-height: 100cqh }
  .tools { position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: light-dark(rgb(255 255 255 / 94%), rgb(27 27 31 / 94%)); box-shadow: 0 2px 12px light-dark(rgb(0 0 0 / 12%), rgb(0 0 0 / 40%)); cursor: default }
  .tools button { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--ink); font-size: 20px; line-height: 1; cursor: pointer }
  .tools button:hover:enabled { background: var(--accent-light) }
  .tools button:disabled { opacity: .35; cursor: default }
  .tools .fit { width: 34px }
  .tools svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5 }
  @media (max-width: 500px) { .tools { right: 6px; bottom: 6px } .tools button { width: 28px; height: 28px } .tools .fit { width: 32px } }
</style>
