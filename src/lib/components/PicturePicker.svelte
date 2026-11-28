<script lang="ts">
  // One picture of a sighting: a file input that works alone, and with scripts a place to drop one, an
  // upright, metadata-free copy to send, and boxes drawn over the characters in a `MarkStage`. Every picker sends `image`,
  // `thumb` and `box`, filled or empty, so the lists a form sends line up picture by picture.
  // A PDF is taken as the picture of one of its pages. A file of several pages shows which, and takes
  // another page or a range; the pages after the first of a range go to `onpages`.
  import { drawPdfPage, isPdf } from '$lib/pdf'
  import { pagesOf } from '$lib/pdf-pages'
  import { prepare, thumbnail, type Box, type Prepared } from '$lib/picture'
  import { t } from '$lib/t'
  import MarkStage from './MarkStage.svelte'

  let { label, onready, onremove, onpages }: { label: string; onready?: (busy: boolean) => void; onremove?: () => void; onpages?: (file: Blob, pages: number[]) => void } = $props()

  const uid = $props.id()
  let input = $state<HTMLInputElement>(), thumbInput = $state<HTMLInputElement>()
  let picture = $state<Prepared | null>(null)
  let pdf = $state<{ file: Blob; pages: number; page: number } | null>(null)
  let previewUrl = $state<string | null>(null)
  let busy = $state(false), bad = $state<'field.imageBad' | 'field.pdfTooLarge' | null>(null), over = $state(false)
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

  export async function take(source: Blob | null | undefined, post = false, page = 1) {
    if (!source) return
    bad = null; busy = true; onready?.(true)
    try {
      let sheet: typeof pdf = null, image = source
      if (await isPdf(source)) {
        const drawn = await drawPdfPage(source, page)
        sheet = { file: source, pages: drawn.pages, page }
        image = drawn.image
      }
      picture = await prepare(image, sheet !== null)
      pdf = sheet
      fetched = post
      boxes = []
      setFiles(input, picture.file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      previewUrl = URL.createObjectURL(picture.file)
      setFiles(thumbInput, await thumbnail(picture.bitmap, null))
      marking = matchMedia('(pointer: fine)').matches
    } catch (error) {
      bad = error instanceof Error && error.message === 'large' ? 'field.pdfTooLarge' : 'field.imageBad'
      clear()
    } finally { busy = false; onready?.(false) }
  }

  export function clear() {
    picture = null; pdf = null; boxes = []; marking = false; fetched = false
    setFiles(input, null); setFiles(thumbInput, null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    previewUrl = null
  }

  async function turn(field: HTMLInputElement) {
    if (!pdf) return
    const { file, page } = pdf
    const asked = pagesOf(field.value, pdf.pages)
    if (!asked) { field.value = String(page); return }
    const [first, ...rest] = asked
    field.value = String(first)
    if (first !== page) await take(file, false, first)
    if (rest.length) onpages?.(file, rest)
  }

  // The thumbnail shows the first box.
  async function refreshThumb() { if (picture) setFiles(thumbInput, await thumbnail(picture.bitmap, boxes[0] ?? null)) }
</script>

<div class="picker">
  <input bind:this={input} id="{uid}-file" class="file" class:gone={picture} type="file" name="image" accept="image/*,application/pdf" aria-label={label} onchange={event => take(event.currentTarget.files?.[0])} />
  <input bind:this={thumbInput} type="file" name="thumb" hidden />
  <input type="hidden" name="box" value={boxes.length ? JSON.stringify(boxes) : ''} />
  {#if picture && previewUrl}
    <MarkStage src={previewUrl} width={picture.width} height={picture.height} bind:boxes bind:marking onchange={refreshThumb}>
      {#snippet actions()}
        <button type="button" class="button" onclick={() => { clear(); input?.click() }}>{t('field.imageReplace')}</button>
        <button type="button" class="button" onclick={() => { clear(); onremove?.() }}>{t('field.imageRemove')}</button>
      {/snippet}
    </MarkStage>
    {#if pdf && pdf.pages > 1}
      <label class="pages">{t('field.pdfPages')}
        <input type="text" inputmode="numeric" size="7" autocomplete="off" value={pdf.page} placeholder={onpages ? '2-4' : '2'} disabled={busy} onchange={event => turn(event.currentTarget)} onkeydown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} />
        <span>/ {pdf.pages}</span>
      </label>
    {/if}
  {:else}
    <label class="drop" class:over for="{uid}-file" ondragover={event => { event.preventDefault(); over = true }} ondragleave={() => over = false} ondrop={event => { event.preventDefault(); over = false; take(event.dataTransfer?.files?.[0]) }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H8l1.5-2h5L16 6h2.5A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
      <span>{busy ? t('field.imageWorking') : t('field.imageDrop')}</span>
    </label>
    {#if onremove}<div><button type="button" class="button" onclick={onremove}>{t('field.imageRemove')}</button></div>{/if}
  {/if}
  {#if bad}<p class="notice bad small">{t(bad)}</p>{/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 8px; min-width: 0 }
  .pages { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--muted) }
  .pages input { width: auto }
  .file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden }
  .gone { display: block }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 150px; padding: 20px; border: 1.5px dashed var(--line-strong); border-radius: 10px; background: var(--surface); color: var(--muted); text-align: center; cursor: pointer }
  .drop:hover, .drop.over { border-color: var(--accent); color: var(--ink); background: var(--accent-light) }
  .file:focus-visible ~ .drop { outline: 3px solid var(--focus-ring); outline-offset: 2px }
</style>
