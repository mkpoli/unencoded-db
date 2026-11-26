<script lang="ts">
  // A sighting's picture with a box drawn over each marked character, unobstructed inline and linked
  // to the full image (opening the full-viewport viewer on click when wired up).
  import { media } from '$lib/t'
  import { boxesOf } from '$lib/picture'
  import type { StoredImage } from '$lib/server/entries'

  let { picture, alt, onopen }: { picture: StoredImage; alt: string; onopen?: () => void } = $props()
  const boxes = $derived(boxesOf(picture.box))
  const src = $derived(media(picture.image_key))

  function open(event: MouseEvent) {
    if (!onopen || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onopen()
  }
</script>

<a class="image" class:interactive={Boolean(onopen)} href={src} target={onopen ? undefined : '_blank'} rel={onopen ? undefined : 'noopener'} onclick={open}>
  <span class="plane">
    <img {src} {alt} width={picture.image_w} height={picture.image_h} loading="lazy" decoding="async" />
    {#each boxes as box}<span class="mark" style:left="{box[0] / picture.image_w * 100}%" style:top="{box[1] / picture.image_h * 100}%" style:width="{box[2] / picture.image_w * 100}%" style:height="{box[3] / picture.image_h * 100}%"></span>{/each}
  </span>
</a>

<style>
  .image { display: flex; align-items: center; justify-content: center; width: 100%; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-sunken); overflow: hidden }
  .image.interactive { cursor: zoom-in }
  .image:hover { border-color: var(--line-strong) }
  .plane { position: relative; display: inline-block; max-width: 100%; line-height: 0 }
  .plane img { display: block; width: auto; height: auto; max-width: 100%; max-height: var(--picture-height, 68vh) }
  @supports (height: 1dvh) { .plane img { max-height: var(--picture-height, 68dvh) } }
  .mark { position: absolute; border: 2px solid var(--mark); pointer-events: none }
</style>
