<script lang="ts">
  // A sighting's picture with a box drawn over each marked character, linked to the full image and
  // enlarged or moved in place.
  import { media } from '$lib/t'
  import { boxesOf } from '$lib/picture'
  import type { StoredImage } from '$lib/server/entries'
  import ZoomablePicture from './ZoomablePicture.svelte'

  let { picture, alt }: { picture: StoredImage; alt: string } = $props()
  const boxes = $derived(boxesOf(picture.box))
  const src = $derived(media(picture.image_key))
</script>

<div class="image">
  <ZoomablePicture {src} {alt} width={picture.image_w} height={picture.image_h} loading="lazy" href={src}>
    {#snippet overlay()}
      {#each boxes as box}<span class="mark" style:left="{box[0] / picture.image_w * 100}%" style:top="{box[1] / picture.image_h * 100}%" style:width="{box[2] / picture.image_w * 100}%" style:height="{box[3] / picture.image_h * 100}%"></span>{/each}
    {/snippet}
  </ZoomablePicture>
</div>

<style>
  .image { background: var(--surface-sunken); border-radius: 6px; overflow: hidden }
  .mark { position: absolute; border: calc(2px * var(--inv, 1)) solid var(--mark); pointer-events: none }
</style>
