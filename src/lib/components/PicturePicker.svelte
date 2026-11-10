<script lang="ts">
  // The picture of a sighting: a file input that works alone, and with scripts a place to drop or paste one, an
  // upright, metadata-free copy to send, and a box drawn over the character. The box and the thumbnail go with
  // the form as `box` and `thumb`.
  import { onMount } from 'svelte'
  import { prepare, thumbnail, type Box, type Prepared } from '$lib/picture'
  import { takePicture } from '$lib/pending'
  import { t } from '$lib/t'

  let { optional = false, onready }: { optional?: boolean; onready?: (busy: boolean) => void } = $props()

  let input = $state<HTMLInputElement>(), thumbInput = $state<HTMLInputElement>()
  let picture = $state<Prepared | null>(null)
  let previewUrl = $state<string | null>(null)
  let busy = $state(false), bad = $state(false), over = $state(false)
  let box = $state<Box | null>(null)
  let marking = $state(false)
  let drag: { x: number; y: number } | null = null
  let stage = $state<HTMLElement>()

  function setFiles(target: HTMLInputElement | undefined, file: File | null) {
    if (!target) return
    const transfer = new DataTransfer()
    if (file) transfer.items.add(file)
    target.files = transfer.files
  }

  async function take(source: Blob | null | undefined) {
    if (!source) return
    bad = false; busy = true; onready?.(true)
    try {
      picture = await prepare(source)
      box = null
      setFiles(input, picture.file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      previewUrl = URL.createObjectURL(picture.file)
      setFiles(thumbInput, await thumbnail(picture.bitmap, null))
      marking = matchMedia('(pointer: fine)').matches
    } catch {
      bad = true
      clear()
    } finally { busy = false; onready?.(false) }
  }

  function clear() {
    picture = null; box = null; marking = false
    setFiles(input, null); setFiles(thumbInput, null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }

  const point = (event: PointerEvent) => {
    const rect = stage!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function down(event: PointerEvent) {
    if (!marking || !picture) return
    event.preventDefault()
    stage!.setPointerCapture(event.pointerId)
    drag = point(event)
    box = null
  }
  function move(event: PointerEvent) {
    if (!drag || !picture) return
    const at = point(event)
    box = [Math.min(drag.x, at.x) * picture.width, Math.min(drag.y, at.y) * picture.height, Math.abs(at.x - drag.x) * picture.width, Math.abs(at.y - drag.y) * picture.height].map(Math.round) as Box
  }
  async function up() {
    if (!drag || !picture) return
    drag = null
    if (box && (box[2] < 4 || box[3] < 4)) box = null
    setFiles(thumbInput, await thumbnail(picture.bitmap, box))
  }
  async function clearBox() { box = null; if (picture) setFiles(thumbInput, await thumbnail(picture.bitmap, null)) }

  const pasted = (event: ClipboardEvent) => {
    const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith('image/'))
    if (file) { event.preventDefault(); take(file) }
  }

  onMount(() => { const held = takePicture(); if (held) take(held) })
</script>

<svelte:window onpaste={pasted} />

<div class="field">
  <span class="label" class:required={!optional}>{t('field.image')}</span>
  <input bind:this={input} id="picture" class="file" class:gone={picture} type="file" name="image" accept="image/*" aria-label={t('field.imageChoose')} onchange={event => take(event.currentTarget.files?.[0])} />
  <input bind:this={thumbInput} type="file" name="thumb" hidden />
  <input type="hidden" name="box" value={box ? JSON.stringify(box) : ''} />
  {#if picture && previewUrl}
    <div class="stage-wrap">
      <div class="stage" class:marking bind:this={stage} role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
        <img src={previewUrl} alt="" draggable="false" />
        {#if box}<div class="box" style:left="{box[0] / picture.width * 100}%" style:top="{box[1] / picture.height * 100}%" style:width="{box[2] / picture.width * 100}%" style:height="{box[3] / picture.height * 100}%"></div>{/if}
      </div>
    </div>
    <div class="row">
      <button type="button" class="button" aria-pressed={marking} class:on={marking} onclick={() => marking = !marking}>{t('field.mark')}</button>
      {#if box}<button type="button" class="button" onclick={clearBox}>{t('field.markClear')}</button>{/if}
      <button type="button" class="button" onclick={() => { clear(); input?.click() }}>{t('field.imageReplace')}</button>
      <button type="button" class="button" onclick={clear}>{t('field.imageRemove')}</button>
    </div>
    {#if marking}<p class="hint">{t('field.markHint')}</p>{/if}
  {:else}
    <label class="drop" class:over for="picture" ondragover={event => { event.preventDefault(); over = true }} ondragleave={() => over = false} ondrop={event => { event.preventDefault(); over = false; take(event.dataTransfer?.files?.[0]) }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
      <span>{busy ? t('field.imageWorking') : t('field.imageDrop')}</span>
    </label>
    <p class="hint">{t('field.imageHint')}</p>
  {/if}
  {#if bad}<p class="notice bad small">{t('field.imageBad')}</p>{/if}
</div>

<style>
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden }
  .gone { display: block }
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
</style>
