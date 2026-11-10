import { readBox, type StoredImage } from '$lib/server/entries'
import { MAX_IMAGE, MAX_THUMB, prepareImage, storeImage } from '$lib/server/image'

// An unenhanced form has no thumbnail; the original is then used as its cover.
export async function uploadedImage(form: FormData, media: R2Bucket): Promise<StoredImage | null | 'invalid'> {
  const file = form.get('image')
  const thumbFile = form.get('thumb')
  if (!(file instanceof File) || !file.size) return thumbFile instanceof File && thumbFile.size ? 'invalid' : null
  if (file.size > MAX_IMAGE || (thumbFile instanceof File && thumbFile.size > MAX_THUMB)) return 'invalid'
  const image = await prepareImage(file, MAX_IMAGE)
  if (!image) return 'invalid'
  const thumb = thumbFile instanceof File && thumbFile.size ? await prepareImage(thumbFile, MAX_THUMB) : image
  if (!thumb) return 'invalid'
  const rawBox = form.get('box')
  const box = rawBox ? readBox(rawBox, image.width, image.height) : null
  if (rawBox && !box) return 'invalid'
  await storeImage(media, image)
  if (thumb.key !== image.key) await storeImage(media, thumb)
  return { image_key: image.key, image_type: image.type, image_w: image.width, image_h: image.height, thumb_key: thumb.key, box }
}

export function positiveId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
