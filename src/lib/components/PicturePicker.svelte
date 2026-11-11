<script lang="ts">
  // The picture of a sighting: a file input that works alone, and with scripts a place to drop or paste one, an
  // upright, metadata-free copy to send, and a box drawn over the character. The box and the thumbnail go with
  // the form as `box` and `thumb`.
  import { onMount, tick } from 'svelte'
  import { type Box, type Prepared } from '$lib/picture'
  import { PicturePickerState, beginPointerBox, preventPendingSubmit } from '$lib/picture-picker'
  import { boxFromPoints, edgeBounds, edges, type Edge } from '$lib/crop'
  import { takePicture } from '$lib/pending'
  import { t } from '$lib/t'

  let { optional = false, onready }: { optional?: boolean; onready?: (busy: boolean) => void } = $props()
  const id = $props.id()
  const sides: Edge[] = ['left', 'top', 'right', 'bottom']

  let input = $state<HTMLInputElement>(), thumbInput = $state<HTMLInputElement>(), boxInput = $state<HTMLInputElement>(), clearButton = $state<HTMLButtonElement>(), markButton = $state<HTMLButtonElement>()
  let controls = $state<HTMLFieldSetElement>(), restoreFocus: HTMLInputElement | null = null
  let picture = $state<Prepared | null>(null)
  let previewUrl = $state<string | null>(null)
  let busy = $state(false), preparing = $state(false), bad = $state(false), thumbnailBad = $state(false), over = $state(false)
  let box = $state<Box | null>(null)
  let marking = $state(false)
  let drag: { x: number; y: number; generation: number; pointerId: number } | null = null
  let stage = $state<HTMLElement>()

  function setFiles(target: HTMLInputElement | undefined, file: File | null) {
    if (!target) return
    const transfer = new DataTransfer()
    if (file) transfer.items.add(file)
    target.files = transfer.files
  }

  let lastPicture: Prepared | null = null, lastThumb: File | null = null
  const processing = new PicturePickerState(state => {
    if (!preparing && state.preparing) {
      const active = document.activeElement
      restoreFocus = active instanceof HTMLInputElement && controls?.contains(active) ? active : null
    }
    const restore = preparing && !state.preparing ? restoreFocus : null
    if (lastPicture !== state.picture) {
      lastPicture = state.picture
      picture = state.picture
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      previewUrl = picture ? URL.createObjectURL(picture.file) : null
      marking = !!picture && matchMedia('(pointer: fine)').matches
      setFiles(input, state.picture?.file ?? null)
    }
    box = state.box; preparing = state.preparing; bad = state.bad; thumbnailBad = state.thumbnailBad
    if (boxInput) boxInput.value = state.box ? JSON.stringify(state.box) : ''
    if (lastThumb !== state.thumb) {
      lastThumb = state.thumb
      setFiles(thumbInput, state.thumb)
    }
    if (busy !== state.busy) { busy = state.busy; onready?.(busy) }
    if (restore) void tick().then(() => {
      if (restoreFocus !== restore || preparing) return
      restoreFocus = null
      if (document.activeElement === document.body) (restore.isConnected && !restore.disabled ? restore : markButton)?.focus()
    })
  })

  function take(source: Blob | null | undefined) {
    setFiles(input, lastPicture?.file ?? null)
    if (!source) return
    drag = null
    void processing.take(source)
  }

  function clear() { drag = null; processing.clear() }

  const point = (event: PointerEvent) => {
    const rect = stage!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function down(event: PointerEvent) {
    if (!marking || !picture || drag) return
    const generation = beginPointerBox(processing, stage!, event)
    if (generation === null) return
    drag = { ...point(event), generation, pointerId: event.pointerId }
  }
  function move(event: PointerEvent) {
    if (!drag || !picture || event.pointerId !== drag.pointerId) return
    const at = point(event)
    processing.moveBox(drag.generation, boxFromPoints(drag, at, picture.width, picture.height))
  }
  function up(event: PointerEvent) {
    if (!drag || !picture || event.pointerId !== drag.pointerId) return
    const generation = drag.generation
    drag = null
    void processing.endBox(generation)
  }
  function clearBox() {
    if (document.activeElement === clearButton) document.getElementById(`${id}-crop-left`)?.focus()
    drag = null
    void processing.clearBox()
  }
  function adjust(edge: Edge, value: number) {
    drag = null
    void processing.adjustEdge(edge, value)
  }

  const pasted = (event: ClipboardEvent) => {
    const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith('image/'))
    if (file) { event.preventDefault(); take(file) }
  }

  onMount(() => {
    const form = input?.form
    const guardSubmit = (event: SubmitEvent) => preventPendingSubmit(event, busy)
    form?.addEventListener('submit', guardSubmit, true)
    const movedFocus = (event: FocusEvent) => { if (event.target !== restoreFocus) restoreFocus = null }
    const usedPointer = () => { restoreFocus = null }
    const usedTab = (event: KeyboardEvent) => { if (event.key === 'Tab') restoreFocus = null }
    document.addEventListener('focusin', movedFocus, true)
    document.addEventListener('pointerdown', usedPointer, true)
    document.addEventListener('keydown', usedTab, true)
    const held = takePicture(); if (held) take(held)
    return () => {
      processing.dispose()
      restoreFocus = null
      document.removeEventListener('focusin', movedFocus, true)
      document.removeEventListener('pointerdown', usedPointer, true)
      document.removeEventListener('keydown', usedTab, true)
      form?.removeEventListener('submit', guardSubmit, true)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  })
</script>

<svelte:window onpaste={pasted} />

<div class="field">
  <span class="label" class:required={!optional}>{t('field.image')}</span>
  <input bind:this={input} id="{id}-picture" class="file" class:gone={picture} type="file" name="image" accept="image/*" aria-label={t('field.imageChoose')} onchange={event => take(event.currentTarget.files?.[0])} oncancel={() => setFiles(input, lastPicture?.file ?? null)} />
  <input bind:this={thumbInput} type="file" name="thumb" hidden />
  <input bind:this={boxInput} type="hidden" name="box" value={box ? JSON.stringify(box) : ''} />
  {#if picture && previewUrl}
    <div class="stage-wrap">
      <div class="stage" class:marking bind:this={stage} role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up}>
        <img src={previewUrl} alt="" draggable="false" />
        {#if box}<div class="box" style:left="{box[0] / picture.width * 100}%" style:top="{box[1] / picture.height * 100}%" style:width="{box[2] / picture.width * 100}%" style:height="{box[3] / picture.height * 100}%"></div>{/if}
      </div>
    </div>
    <div class="row">
      <button bind:this={markButton} type="button" class="button" aria-pressed={marking} class:on={marking} onclick={() => marking = !marking}>{t('field.mark')}</button>
      <button bind:this={clearButton} type="button" class="button" disabled={!box || preparing} onclick={clearBox}>{t('field.markClear')}</button>
      <button type="button" class="button" onclick={() => input?.click()}>{t('field.imageReplace')}</button>
      <button type="button" class="button" onclick={clear}>{t('field.imageRemove')}</button>
    </div>
    {#if marking}<p class="hint">{t('field.markHint')}</p>{/if}
    {#if picture.width >= 4 && picture.height >= 4}
    <fieldset class="adjust" bind:this={controls}>
      <legend>{t('field.markAdjust')}</legend>
      <div class="adjust-grid">
        {#each sides as side}
          {@const bounds = edgeBounds(side, box, picture.width, picture.height)}
          {@const value = edges(box, picture.width, picture.height)[side]}
          <div class="edge">
            <label for="{id}-crop-{side}">{t(`field.mark.${side}`)}</label>
            <span aria-hidden="true">{value}</span>
            <input id="{id}-crop-{side}" type="range" min={bounds[0]} max={bounds[1]} {value} disabled={preparing} aria-valuetext={t('field.markPixels', { value })} oninput={event => adjust(side, event.currentTarget.valueAsNumber)} />
          </div>
        {/each}
      </div>
    </fieldset>
    {/if}
  {:else}
    <label class="drop" class:over for="{id}-picture" ondragover={event => { event.preventDefault(); over = true }} ondragleave={() => over = false} ondrop={event => { event.preventDefault(); over = false; take(event.dataTransfer?.files?.[0]) }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
      <span>{busy ? t('field.imageWorking') : t('field.imageDrop')}</span>
    </label>
    <p class="hint">{t('field.imageHint')}</p>
  {/if}
  <div role="status">{#if bad}<p class="notice bad small">{t(thumbnailBad ? 'error.title' : 'field.imageBad')}</p>{/if}</div>
</div>

<style>
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden }
  .gone { display: none }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 150px; padding: 20px; border: 1.5px dashed var(--line-strong); border-radius: 10px; background: var(--surface); color: var(--muted); text-align: center; cursor: pointer }
  .drop:hover, .drop.over { border-color: var(--accent); color: var(--ink); background: var(--accent-light) }
  .file:focus-visible ~ .drop { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .stage-wrap { display: flex; justify-content: center; padding: 10px; border-radius: 10px; background: var(--surface-sunken) }
  .stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; user-select: none }
  .stage.marking { cursor: crosshair; touch-action: none }
  .stage img { display: block; max-width: 100%; max-height: 62vh; pointer-events: none }
  .box { position: absolute; border: 2px solid var(--mark); box-shadow: 0 0 0 9999px rgb(0 0 0 / 28%); pointer-events: none }
  .stage { overflow: hidden }
  .button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light) }
  .adjust { min-width: 0; margin: 0; padding: 0; border: 0 }
  .adjust legend { padding: 0; font-weight: 500 }
  .adjust-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; margin-top: 6px }
  .edge { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; min-width: 0 }
  .edge span { color: var(--muted); font-variant-numeric: tabular-nums }
  .edge input { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: var(--accent) }
  @media (max-width: 480px) { .adjust-grid { grid-template-columns: 1fr } }
</style>
