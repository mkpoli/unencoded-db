import { readBoxes, type StoredImage } from '$lib/server/entries'
import { MAX_IMAGE, MAX_THUMB, prepareImage, storeImage } from '$lib/server/image'
import { MEDIA_MAX } from '$lib/limits'

// The pictures a form sends: each picker posts `image`, `thumb` and `box` together, so the three lists
// line up. An unenhanced form has no thumbnail; the original is then used as its cover.
export async function uploadedImages(form: FormData, media: R2Bucket): Promise<StoredImage[] | 'invalid'> {
  const files = form.getAll('image'), thumbs = form.getAll('thumb'), boxes = form.getAll('box')
  const paired = thumbs.length === files.length, marked = boxes.length === files.length
  if (!paired && thumbs.some(thumb => thumb instanceof File && thumb.size)) return 'invalid'
  const prepared: { image: NonNullable<Awaited<ReturnType<typeof prepareImage>>>; thumb: NonNullable<Awaited<ReturnType<typeof prepareImage>>>; box: string | null }[] = []
  for (const [index, file] of files.entries()) {
    const thumbFile = paired ? thumbs[index] : null
    const hasThumb = thumbFile instanceof File && thumbFile.size > 0
    if (!(file instanceof File) || !file.size) {
      if (hasThumb) return 'invalid'
      continue
    }
    if (prepared.length >= MEDIA_MAX || file.size > MAX_IMAGE || (hasThumb && thumbFile.size > MAX_THUMB)) return 'invalid'
    const image = await prepareImage(file, MAX_IMAGE)
    if (!image) return 'invalid'
    const thumb = hasThumb ? await prepareImage(thumbFile, MAX_THUMB) : image
    if (!thumb) return 'invalid'
    const rawBox = marked ? boxes[index] : null
    const box = rawBox ? readBoxes(rawBox, image.width, image.height) : null
    if (rawBox && !box) return 'invalid'
    prepared.push({ image, thumb, box })
  }
  // Nothing is stored until every picture is known to be one.
  for (const { image, thumb } of prepared) {
    await storeImage(media, image)
    if (thumb.key !== image.key) await storeImage(media, thumb)
  }
  return prepared.map(({ image, thumb, box }) => ({ image_key: image.key, image_type: image.type, image_w: image.width, image_h: image.height, thumb_key: thumb.key, box }))
}

export function positiveId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
