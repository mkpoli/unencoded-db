<script lang="ts">
  // One picture of a sighting: a file input that works alone, and with scripts a place to drop one, an
  // upright, metadata-free copy to send, and boxes drawn over the characters, up to BOXES_MAX. Every picker sends `image`,
  // `thumb` and `box`, filled or empty, so the lists a form sends line up picture by picture.
  import { prepare, thumbnail, type Box, type Prepared } from '$lib/picture'
  import { BOXES_MAX } from '$lib/limits'
  import { t } from '$lib/t'

  let { label, onready, onremove }: { label: string; onready?: (busy: boolean) => void; onremove?: () => void } = $props()

  const uid = $props.id()
  let input = $state<HTMLInputElement>(), thumbInput = $state<HTMLInputElement>()
  let picture = $state<Prepared | null>(null)
  let previewUrl = $state<string | null>(null)
  let busy = $state(false), bad = $state(false), over = $state(false)
  let boxes = $state<Box[]>([])
  let draft = $state<Box | null>(null)
  let marking = $state(false)
  let drag: { x: number; y: number } | null = null
  let stage = $state<HTMLElement>()
  let fetched = false

  function setFiles(target: HTMLInputElement | undefined, file: File | null) {
    if (!target) return
    const transfer = new DataTransfer()
    if (file) transfer.items.add(file)
    target.files = transfer.files
  }

  /** Whether the picker holds no picture, or only one a source link supplied. */
  export const open = (forPost = false) => !picture && !busy || (forPost && fetched)
  export const fromPost = () => fetched

  export async function take(source: Blob | null | undefined, post = false) {
    if (!source) return
    bad = false; busy = true; onready?.(true)
    try {
      picture = await prepare(source)
      fetched = post
      boxes = []; draft = null
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

  export function clear() {
    picture = null; boxes = []; draft = null; marking = false; fetched = false
    setFiles(input, null); setFiles(thumbInput, null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }

  const point = (event: PointerEvent) => {
    const rect = stage!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) }
  }
  function down(event: PointerEvent) {
    if (!marking || !picture || boxes.length >= BOXES_MAX) return
    event.preventDefault()
    stage!.setPointerCapture(event.pointerId)
    drag = point(event)
  }
  function move(event: PointerEvent) {
    if (!drag || !picture) return
    const at = point(event)
    draft = [Math.min(drag.x, at.x) * picture.width, Math.min(drag.y, at.y) * picture.height, Math.abs(at.x - drag.x) * picture.width, Math.abs(at.y - drag.y) * picture.height].map(Math.round) as Box
  }
  async function up() {
    if (!drag || !picture) return
    drag = null
    const drawn = draft
    draft = null
    if (!drawn || drawn[2] < 4 || drawn[3] < 4) return
    boxes.push(drawn)
    await refreshThumb()
  }
  // The thumbnail shows the first box.
  async function refreshThumb() { if (picture) setFiles(thumbInput, await thumbnail(picture.bitmap, boxes[0] ?? null)) }
  async function removeBox(index: number) { boxes.splice(index, 1); await refreshThumb() }
  async function clearBoxes() { boxes = []; await refreshThumb() }
</script>

<div class="picker">
  <input bind:this={input} id="{uid}-file" class="file" class:gone={picture} type="file" name="image" accept="image/*" aria-label={label} onchange={event => take(event.currentTarget.files?.[0])} />
  <input bind:this={thumbInput} type="file" name="thumb" hidden />
  <input type="hidden" name="box" value={boxes.length ? JSON.stringify(boxes) : ''} />
  {#if picture && previewUrl}
    <div class="stage-wrap">
      <div class="stage" class:marking bind:this={stage} role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
        <img src={previewUrl} alt="" draggable="false" />
        {#each draft ? [...boxes, draft] : boxes as box, index}<div class="box" style:left="{box[0] / picture.width * 100}%" style:top="{box[1] / picture.height * 100}%" style:width="{box[2] / picture.width * 100}%" style:height="{box[3] / picture.height * 100}%">{#if boxes.length > 1 || draft}<span class="number">{index + 1}</span>{/if}</div>{/each}
      </div>
    </div>
    <div class="row">
      <button type="button" class="button" aria-pressed={marking} class:on={marking} onclick={() => marking = !marking}>{t('field.mark')}</button>
      {#each boxes as _, index}<button type="button" class="button" title={t('field.markRemove', { n: index + 1 })} aria-label={t('field.markRemove', { n: index + 1 })} onclick={() => removeBox(index)}>{index + 1} ×</button>{/each}
      {#if boxes.length > 1}<button type="button" class="button" onclick={clearBoxes}>{t('field.markClear')}</button>{/if}
      <button type="button" class="button" onclick={() => { clear(); input?.click() }}>{t('field.imageReplace')}</button>
      <button type="button" class="button" onclick={() => { clear(); onremove?.() }}>{t('field.imageRemove')}</button>
    </div>
    {#if marking}<p class="hint">{t('field.markHint')}</p>{/if}
  {:else}
    <label class="drop" class:over for="{uid}-file" ondragover={event => { event.preventDefault(); over = true }} ondragleave={() => over = false} ondrop={event => { event.preventDefault(); over = false; take(event.dataTransfer?.files?.[0]) }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
      <span>{busy ? t('field.imageWorking') : t('field.imageDrop')}</span>
    </label>
    {#if onremove}<div><button type="button" class="button" onclick={onremove}>{t('field.imageRemove')}</button></div>{/if}
  {/if}
  {#if bad}<p class="notice bad small">{t('field.imageBad')}</p>{/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 8px; min-width: 0 }
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden }
  .gone { display: block }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 150px; padding: 20px; border: 1.5px dashed var(--line-strong); border-radius: 10px; background: var(--surface); color: var(--muted); text-align: center; cursor: pointer }
  .drop:hover, .drop.over { border-color: var(--accent); color: var(--ink); background: var(--accent-light) }
  .file:focus-visible ~ .drop { outline: 3px solid var(--focus-ring); outline-offset: 2px }
  .stage-wrap { display: flex; justify-content: center; padding: 10px; border-radius: 10px; background: var(--surface-sunken) }
  .stage { position: relative; display: inline-block; max-width: 100%; overflow: hidden; line-height: 0; user-select: none }
  .stage.marking { cursor: crosshair; touch-action: none }
  .stage img { display: block; max-width: 100%; max-height: 62vh; pointer-events: none }
  .box { position: absolute; border: 2px solid var(--mark); box-shadow: 0 0 0 9999px rgb(0 0 0 / 28%); pointer-events: none }
  .number { position: absolute; top: 0; left: 0; padding: 0 4px; background: var(--mark); color: #fff; font: 600 11px/1.5 system-ui }
  .button.on { border-color: var(--accent); color: var(--accent); background: var(--accent-light) }
</style>
