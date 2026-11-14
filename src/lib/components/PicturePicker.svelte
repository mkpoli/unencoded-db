<script lang="ts">
  // One picture of a sighting: a file input that works alone, and with scripts a place to drop one, an
  // upright, metadata-free copy to send, and boxes drawn over the characters in a `MarkStage`. Every picker sends `image`,
  // `thumb` and `box`, filled or empty, so the lists a form sends line up picture by picture.
  import { prepare, thumbnail, type Box, type Prepared } from '$lib/picture'
  import { t } from '$lib/t'
  import MarkStage from './MarkStage.svelte'

  let { label, onready, onremove }: { label: string; onready?: (busy: boolean) => void; onremove?: () => void } = $props()

  const uid = $props.id()
  let input = $state<HTMLInputElement>(), thumbInput = $state<HTMLInputElement>()
  let picture = $state<Prepared | null>(null)
  let previewUrl = $state<string | null>(null)
  let busy = $state(false), bad = $state(false), over = $state(false)
  let boxes = $state<Box[]>([])
  let marking = $state(false)
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
      boxes = []
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
    picture = null; boxes = []; marking = false; fetched = false
    setFiles(input, null); setFiles(thumbInput, null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }

  // The thumbnail shows the first box.
  async function refreshThumb() { if (picture) setFiles(thumbInput, await thumbnail(picture.bitmap, boxes[0] ?? null)) }
</script>

<div class="picker">
  <input bind:this={input} id="{uid}-file" class="file" class:gone={picture} type="file" name="image" accept="image/*" aria-label={label} onchange={event => take(event.currentTarget.files?.[0])} />
  <input bind:this={thumbInput} type="file" name="thumb" hidden />
  <input type="hidden" name="box" value={boxes.length ? JSON.stringify(boxes) : ''} />
  {#if picture && previewUrl}
    <MarkStage src={previewUrl} width={picture.width} height={picture.height} bind:boxes bind:marking onchange={refreshThumb}>
      {#snippet actions()}
        <button type="button" class="button" onclick={() => { clear(); input?.click() }}>{t('field.imageReplace')}</button>
        <button type="button" class="button" onclick={() => { clear(); onremove?.() }}>{t('field.imageRemove')}</button>
      {/snippet}
    </MarkStage>
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
</style>
