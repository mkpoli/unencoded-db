<script lang="ts">
  // A sighting's picture with the character's box drawn over it, linked to the full image.
  import { media } from '$lib/t'
  import type { Box } from '$lib/picture'
  import type { StoredImage } from '$lib/server/entries'

  let { picture, alt }: { picture: StoredImage; alt: string } = $props()
  const box = $derived.by((): Box | null => {
    try { const found = JSON.parse(picture.box ?? 'null'); return Array.isArray(found) && found.length === 4 ? found as Box : null } catch { return null }
  })
</script>

<a class="image" href={media(picture.image_key)}>
  <span class="frame">
    <img src={media(picture.image_key)} {alt} width={picture.image_w} height={picture.image_h} loading="lazy" />
    {#if box}<span class="mark" style:left="{box[0] / picture.image_w * 100}%" style:top="{box[1] / picture.image_h * 100}%" style:width="{box[2] / picture.image_w * 100}%" style:height="{box[3] / picture.image_h * 100}%"></span>{/if}
  </span>
</a>

<style>
  .image { display:flex; justify-content:center; background:var(--surface-sunken); border-radius:6px; overflow:hidden }
  .frame { position:relative; display:inline-block; max-width:100%; line-height:0 }
  .frame img { display:block; width:auto; height:auto; max-width:100%; max-height:var(--picture-height, 65vh) }
  .mark { position:absolute; border:2px solid var(--mark); pointer-events:none }
</style>
