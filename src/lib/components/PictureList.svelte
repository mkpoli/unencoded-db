<script lang="ts">
  // The new pictures of a sighting, up to `max`. A pasted picture, or one held from another page, goes to
  // the first empty picker; a source link's photo goes to the first picker unless someone chose its picture.
  // Where a form holds several sightings, each inside an element marked `data-sighting`, a pasted picture
  // goes to the sighting that has the focus, or to the first when none has.
  import { onMount, tick } from 'svelte'
  import { takePicture } from '$lib/pending'
  import { t } from '$lib/t'
  import PicturePicker from './PicturePicker.svelte'

  let { max, required = false, onready }: { max: number; required?: boolean; onready?: (busy: boolean) => void } = $props()

  let next = 1
  let root = $state<HTMLElement>()
  let slots = $state<number[]>([0])
  const pickers: Record<number, PicturePicker | null> = {}
  let working = 0
  const ready = (busy: boolean) => { working = Math.max(0, working + (busy ? 1 : -1)); onready?.(working > 0) }
  const visible = $derived(slots.slice(0, Math.max(0, max)))

  const free = () => visible.map(slot => pickers[slot]).find(picker => picker?.open())

  /** Puts a photo from a source link in the first picker, or takes back the one it put there. */
  export function offer(file: File | null) {
    const first = pickers[visible[0]]
    if (!first) return
    if (file) { if (first.open(true)) void first.take(file, true) }
    else if (first.fromPost()) first.clear()
  }

  /** Puts a picture in the first empty picker, adding one when all are taken. */
  export const add = (file: Blob) => place(file)

  async function place(file: Blob) {
    let picker = free()
    if (!picker && visible.length < max) {
      const slot = next++
      slots.push(slot)
      await tick()
      picker = pickers[slot]
    }
    await picker?.take(file)
  }

  const pasted = (event: ClipboardEvent) => {
    const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith('image/'))
    if (!file) return
    const lists = [...document.querySelectorAll('[data-pictures]')]
    const focused = document.activeElement?.closest('[data-sighting]')
    if ((lists.find(list => focused?.contains(list)) ?? lists[0]) !== root) return
    event.preventDefault()
    void place(file)
  }

  onMount(() => { const held = takePicture(); if (held) void place(held) })
</script>

<svelte:window onpaste={pasted} />

<div class="field" bind:this={root} data-pictures>
  <span class="label" class:required>{t('field.image')}</span>
  {#each visible as slot, index (slot)}
    <PicturePicker bind:this={pickers[slot]} label="{t('field.imageChoose')} {index + 1}" onready={ready} onremove={visible.length > 1 ? () => slots = slots.filter(item => item !== slot) : undefined} />
  {/each}
  {#if visible.length < max}<div><button type="button" class="text-button" onclick={() => slots.push(next++)}>+ {t('field.imageAdd')}</button></div>{/if}
</div>
