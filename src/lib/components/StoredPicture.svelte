<script lang="ts">
  // A picture a sighting already holds, on its edit form: its marks can be redrawn, and it can be removed.
  // It sends `media_box` and `media_thumb` once each, so the lists line up with the stored pictures; the
  // thumbnail is made again from the first box only when the marks change.
  import { untrack } from 'svelte'
  import { boxesOf, thumbnail, type Box } from '$lib/picture'
  import { media, t } from '$lib/t'
  import type { StoredImage } from '$lib/server/entries'
  import MarkStage from './MarkStage.svelte'

  let { picture, position, removed = $bindable([]), onready }: { picture: StoredImage; position: number; removed?: string[]; onready?: (busy: boolean) => void } = $props()

  let boxes = $state<Box[]>(untrack(() => boxesOf(picture.box)))
  let thumbInput = $state<HTMLInputElement>()
  let bitmap: Promise<ImageBitmap> | null = null
  let pending = 0
  const gone = $derived(removed.includes(String(position)))

  async function refreshThumb(marks: Box[]) {
    const turn = ++pending
    onready?.(true)
    try {
      bitmap ??= fetch(media(picture.image_key)).then(response => response.blob()).then(blob => createImageBitmap(blob))
      const file = await thumbnail(await bitmap, marks[0] ?? null)
      if (turn !== pending || !thumbInput) return
      const transfer = new DataTransfer()
      transfer.items.add(file)
      thumbInput.files = transfer.files
    } catch {
      bitmap = null
    } finally { if (turn === pending) onready?.(false) }
  }
</script>

<div class="stored" class:gone>
  <input type="hidden" name="media_box" value={boxes.length ? JSON.stringify(boxes) : ''} />
  <input bind:this={thumbInput} type="file" name="media_thumb" hidden />
  <MarkStage src={media(picture.image_key)} width={picture.image_w} height={picture.image_h} bind:boxes disabled={gone} onchange={refreshThumb}>
    {#snippet actions()}
      <label class="remove"><input type="checkbox" name="remove_media" value={String(position)} bind:group={removed} /> {t('sighting.removePicture')}</label>
    {/snippet}
  </MarkStage>
</div>

<style>
  .stored { display: flex; flex-direction: column; gap: 8px; min-width: 0 }
  .stored.gone :global(.stage-wrap) { opacity: .35 }
  .remove { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); cursor: pointer }
</style>
