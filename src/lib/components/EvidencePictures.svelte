<script lang="ts">
  // Responsive gallery of sighting evidence pictures paired with a full-viewport lightbox viewer.
  // Wide scans span the full width of the panel so panoramic pages stay legible inline.
  import type { StoredImage } from '$lib/server/entries'
  import { t } from '$lib/t'
  import MarkedPicture from './MarkedPicture.svelte'
  import PictureLightbox from './PictureLightbox.svelte'

  let {
    pictures,
    alt,
    preparing = null,
    ondownload,
  }: {
    pictures: readonly StoredImage[]
    alt: (position: number) => string
    preparing?: string | null
    ondownload?: (picture: StoredImage, position: number) => void
  } = $props()

  let lightbox = $state<PictureLightbox>()
  const isWide = (picture: StoredImage) => picture.image_h > 0 && picture.image_w / picture.image_h >= 1.8
</script>

{#if pictures.length}
  <div class="pictures" class:single={pictures.length === 1}>
    {#each pictures as picture, position (picture.image_key)}
      <figure class:wide={pictures.length > 1 && isWide(picture)}>
        <MarkedPicture {picture} alt={alt(position)} onopen={() => lightbox?.open(position)} />
        <figcaption class="actions">
          <button type="button" class="button small" onclick={() => lightbox?.open(position)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            {t('picture.view')}
          </button>
          {#if ondownload}
            <button type="button" class="button small" title={t('sighting.evidenceHint')} disabled={preparing === picture.image_key} onclick={() => ondownload(picture, position)}>{t('sighting.evidence')}</button>
          {/if}
        </figcaption>
      </figure>
    {/each}
  </div>
  <PictureLightbox bind:this={lightbox} {pictures} {alt} {preparing} {ondownload} />
{/if}

<style>
  .pictures { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 14px; align-items: start }
  .pictures.single { grid-template-columns: minmax(0, 1fr); --picture-height: 68vh }
  .pictures:not(.single) { --picture-height: 460px }
  @supports (height: 1dvh) { .pictures.single { --picture-height: 68dvh } }
  figure { display: flex; flex-direction: column; gap: 8px; margin: 0; min-width: 0 }
  figure.wide { grid-column: 1 / -1 }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px }
  .button.small { min-height: 32px; padding: 4px 10px; font-size: 12.5px }
  .button.small svg { width: 15px; height: 15px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round }
</style>
