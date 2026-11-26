<script lang="ts">
  // Full-viewport modal viewer for sighting evidence pictures: keeps zoom controls in a top bar
  // outside the image so the whole viewport stays unobstructed for wide scans and tall strips.
  import { tick } from 'svelte'
  import { boxesOf } from '$lib/picture'
  import type { StoredImage } from '$lib/server/entries'
  import { media, t } from '$lib/t'
  import { ZOOM_MAX, ZOOM_STEP, type Pan } from '$lib/zoom'
  import ZoomablePicture from './ZoomablePicture.svelte'

  let {
    pictures,
    alt,
    preparing = null,
    ondownload,
  }: {
    pictures: readonly StoredImage[]
    alt: (position: number) => string
    preparing?: string | null
    ondownload?: (picture: StoredImage, position: number) => void
  } = $props()

  const titleId = $props.id()
  let dialog = $state<HTMLDialogElement>()
  let viewer = $state<ZoomablePicture>()
  let active = $state<number | null>(null)
  let zoom = $state(1)
  let maxZoom = $state(ZOOM_MAX)
  let pan = $state<Pan>({ x: 0, y: 0 })
  let markIndex = $state(0)

  const current = $derived(active !== null ? pictures[active] ?? null : null)
  const boxes = $derived(current ? boxesOf(current.box) : [])
  const src = $derived(current ? media(current.image_key) : '')
  const caption = $derived(active !== null ? alt(active) : '')

  export async function open(position: number) {
    if (!pictures.length) return
    active = Math.max(0, Math.min(pictures.length - 1, position))
    zoom = 1
    pan = { x: 0, y: 0 }
    markIndex = 0
    await tick()
    if (dialog && !dialog.open) dialog.showModal()
  }

  function closed() {
    active = null
    zoom = 1
    pan = { x: 0, y: 0 }
    markIndex = 0
  }

  function step(delta: number) {
    if (active === null || pictures.length < 2) return
    active = (active + delta + pictures.length) % pictures.length
    zoom = 1
    pan = { x: 0, y: 0 }
    markIndex = 0
  }

  function jumpToMark() {
    if (!current || !boxes.length) return
    const box = boxes[markIndex % boxes.length]
    markIndex = (markIndex + 1) % boxes.length
    viewer?.focusOn(box, { width: current.image_w, height: current.image_h })
  }

  function keydown(event: KeyboardEvent) {
    if (active === null || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.zoom')) {
      if (zoom <= 1 && pictures.length > 1) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
        else if (event.key === 'ArrowRight') { event.preventDefault(); step(1) }
      }
      return
    }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); viewer?.zoomBy(ZOOM_STEP) }
    else if (event.key === '-') { event.preventDefault(); viewer?.zoomBy(1 / ZOOM_STEP) }
    else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); viewer?.reset() }
    else if (event.key === 'ArrowLeft' && pictures.length > 1) { event.preventDefault(); step(-1) }
    else if (event.key === 'ArrowRight' && pictures.length > 1) { event.preventDefault(); step(1) }
  }

  // Light-dismiss fallback for browsers without native <dialog closedby="any"> support (e.g. Safari).
  $effect(() => {
    const node = dialog
    if (!node || typeof HTMLDialogElement === 'undefined' || 'closedBy' in HTMLDialogElement.prototype) return
    const outside = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    }
    let pressedOutside = false
    const onDown = (event: PointerEvent) => { pressedOutside = outside(event) }
    const onUp = (event: PointerEvent) => { if (pressedOutside && outside(event)) node.close(); pressedOutside = false }
    node.addEventListener('pointerdown', onDown)
    node.addEventListener('pointerup', onUp)
    return () => {
      node.removeEventListener('pointerdown', onDown)
      node.removeEventListener('pointerup', onUp)
    }
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  {...({ closedby: 'any' } as Record<string, string>)}
  aria-labelledby={titleId}
  onclose={closed}
  onkeydown={keydown}
>
  {#if current && active !== null}
    <header class="bar">
      <div class="meta">
        {#if pictures.length > 1}
          <div class="nav">
            <button type="button" class="tool icon" aria-label={t('picture.previous')} title={t('picture.previous')} onclick={() => step(-1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span class="counter">{active + 1}/{pictures.length}</span>
            <button type="button" class="tool icon" aria-label={t('picture.next')} title={t('picture.next')} onclick={() => step(1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        {/if}
        <h1 id={titleId} class="caption">{caption}</h1>
      </div>

      <div class="controls">
        <div class="group" role="group" aria-label={t('field.imageZoom')}>
          <button type="button" class="tool icon" aria-label={t('field.imageZoomOut')} title={t('field.imageZoomOut')} disabled={zoom <= 1} onclick={() => viewer?.zoomBy(1 / ZOOM_STEP)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
          </button>
          <button type="button" class="tool readout" aria-label={t('field.imageZoomFit')} title={t('field.imageZoomFit')} disabled={zoom <= 1} onclick={() => viewer?.reset()}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" class="tool icon" aria-label={t('field.imageZoomIn')} title={t('field.imageZoomIn')} disabled={zoom >= maxZoom} onclick={() => viewer?.zoomBy(ZOOM_STEP)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>

        {#if boxes.length}
          <button type="button" class="tool" title={t('picture.focusMark')} aria-label={t('picture.focusMark')} onclick={jumpToMark}>
            <svg class="mark-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="1.5"/><circle cx="12" cy="12" r="2"/></svg>
            <span class="label">{t('picture.focusMark')}</span>
          </button>
        {/if}

        <a class="tool" href={src} target="_blank" rel="noopener" title={t('picture.openOriginal')} aria-label={t('picture.openOriginal')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 14 20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>
          <span class="label">{t('picture.openOriginal')}</span>
        </a>

        {#if ondownload}
          <button type="button" class="tool" title={t('sighting.evidenceHint')} disabled={preparing === current.image_key} onclick={() => ondownload(current, active!)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
            <span class="label">{t('sighting.evidence')}</span>
          </button>
        {/if}

        <form method="dialog" class="close-form">
          <!-- svelte-ignore a11y_autofocus -->
          <button type="submit" class="tool icon close" aria-label={t('spelling.close')} title={t('spelling.close')} autofocus>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </form>
      </div>
    </header>

    <div class="stage">
      {#key current.image_key}
        <ZoomablePicture
          bind:this={viewer}
          {src}
          alt={caption}
          width={current.image_w}
          height={current.image_h}
          loading="eager"
          fill
          wheelZoom
          hideTools
          bind:zoom
          bind:maxZoom
          bind:pan
        >
          {#snippet overlay()}
            {#each boxes as box}<span class="mark" style:left="{box[0] / current.image_w * 100}%" style:top="{box[1] / current.image_h * 100}%" style:width="{box[2] / current.image_w * 100}%" style:height="{box[3] / current.image_h * 100}%"></span>{/each}
          {/snippet}
        </ZoomablePicture>
      {/key}
    </div>
  {/if}
</dialog>

<style>
  dialog[open] {
    display: flex;
    flex-direction: column;
    width: calc(100vw - 24px);
    max-width: none;
    height: calc(100vh - 24px);
    max-height: none;
    margin: auto;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
  }
  @supports (height: 1dvh) {
    dialog[open] { height: calc(100dvh - 24px) }
  }
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 48px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }
  .meta { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 }
  .nav { display: inline-flex; align-items: center; gap: 2px; flex: none }
  .counter { min-width: 3ch; text-align: center; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums }
  .caption {
    margin: 0;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls { display: flex; align-items: center; gap: 6px; flex: none }
  .group {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface-sunken);
  }
  .tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface);
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
  }
  .tool:hover:not(:disabled) { border-color: var(--line-strong); background: var(--surface-sunken) }
  .tool:disabled { opacity: .4; cursor: default }
  .tool.icon { min-width: 34px; padding: 4px }
  .group .tool { min-height: 28px; min-width: 28px; padding: 2px 6px; border: 0; border-radius: 5px; background: transparent }
  .group .tool:hover:not(:disabled) { background: var(--surface) }
  .group .readout { min-width: 48px; font-variant-numeric: tabular-nums; font-size: 12.5px }
  .tool svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round }
  .tool .mark-icon { color: var(--mark) }
  .close-form { display: contents }
  .stage {
    flex: 1;
    min-height: 0;
    width: 100%;
    position: relative;
    background: var(--surface-sunken);
    overflow: hidden;
  }
  .mark { position: absolute; border: calc(2px * var(--inv, 1)) solid var(--mark); pointer-events: none }

  @media (max-width: 900px) {
    .tool .label { display: none }
    .tool { min-width: 34px; padding: 4px }
  }
  @media (max-width: 600px) {
    dialog[open] { width: 100vw; height: 100vh; border: 0; border-radius: 0 }
    @supports (height: 1dvh) { dialog[open] { height: 100dvh } }
    .bar { padding: 6px 8px; gap: 6px }
    .caption { display: none }
    .controls { gap: 4px }
  }
</style>
