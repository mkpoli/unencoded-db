import { readBoxes, SIGHTING_FIELDS, type StoredImage } from '$lib/server/entries'
import { MAX_IMAGE, MAX_THUMB, prepareImage, storeImage } from '$lib/server/image'
import { MEDIA_MAX } from '$lib/limits'
import { SIGHTING_START } from '$lib/scripts'

const SIGHTING_NAMES = new Set<string>([...SIGHTING_FIELDS, 'image', 'thumb', 'box'])

// The sightings of a form, in the order of the page: one form of its own for each, with the fields and
// pictures between its opening field and the next. Fields of the record itself are left out, wherever
// they stand. A form without the opening field holds one sighting, as the form of a single sighting does.
export function sightingForms(form: FormData): FormData[] {
  if (!form.has(SIGHTING_START)) return [form]
  const sightings: FormData[] = []
  for (const [name, value] of form.entries()) {
    if (name === SIGHTING_START) sightings.push(new FormData())
    else if (sightings.length && SIGHTING_NAMES.has(name)) sightings.at(-1)!.append(name, value)
  }
  return sightings
}

type Prepared = NonNullable<Awaited<ReturnType<typeof prepareImage>>>
export type ReadImage = { image: Prepared; thumb: Prepared; box: string | null }

// The pictures a form sends: each picker posts `image`, `thumb` and `box` together, so the three lists
// line up. An unenhanced form has no thumbnail; the original is then used as its cover. Nothing is stored
// here, so a form can be read whole before any of it is kept.
export async function readImages(form: FormData): Promise<ReadImage[] | 'invalid'> {
  const files = form.getAll('image'), thumbs = form.getAll('thumb'), boxes = form.getAll('box')
  const paired = thumbs.length === files.length, marked = boxes.length === files.length
  if (!paired && thumbs.some(thumb => thumb instanceof File && thumb.size)) return 'invalid'
  const prepared: ReadImage[] = []
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
  return prepared
}

export async function storeImages(media: R2Bucket, images: ReadImage[]): Promise<StoredImage[]> {
  for (const { image, thumb } of images) {
    await storeImage(media, image)
    if (thumb.key !== image.key) await storeImage(media, thumb)
  }
  return images.map(({ image, thumb, box }) => ({ image_key: image.key, image_type: image.type, image_w: image.width, image_h: image.height, thumb_key: thumb.key, box }))
}

// Nothing is stored until every picture is known to be one.
export async function uploadedImages(form: FormData, media: R2Bucket): Promise<StoredImage[] | 'invalid'> {
  const images = await readImages(form)
  return images === 'invalid' ? images : storeImages(media, images)
}

export type Mark = { box: string | null; thumb: Prepared }

// The marks a form sends for the pictures a sighting already holds: `media_box` and `media_thumb` once per
// picture, in their order. Null when no mark changed. A picture whose marks changed needs a thumbnail of
// the new first box, and nothing is stored here.
export async function readMarks(form: FormData, stored: StoredImage[]): Promise<(Mark | null)[] | null | 'invalid'> {
  const boxes = form.getAll('media_box'), thumbs = form.getAll('media_thumb')
  if (!boxes.length) return thumbs.some(thumb => thumb instanceof File && thumb.size) ? 'invalid' : null
  if (boxes.length !== stored.length || (thumbs.length && thumbs.length !== stored.length)) return 'invalid'
  const marks: (Mark | null)[] = []
  let changed = false
  for (const [index, picture] of stored.entries()) {
    const raw = String(boxes[index])
    const box = raw ? readBoxes(raw, picture.image_w, picture.image_h) : null
    if (raw && !box) return 'invalid'
    if (box === picture.box) { marks.push(null); continue }
    changed = true
    const file = thumbs[index]
    const thumb = file instanceof File && file.size && file.size <= MAX_THUMB ? await prepareImage(file, MAX_THUMB) : null
    if (!thumb) return 'invalid'
    marks.push({ box, thumb })
  }
  return changed ? marks : null
}

// The pictures a sighting keeps, with their new marks, storing the thumbnail of each one marked anew.
export async function keptPictures(media: R2Bucket, stored: StoredImage[], marks: (Mark | null)[] | null, removed: Set<number>): Promise<StoredImage[]> {
  const marked: StoredImage[] = []
  for (const [index, picture] of stored.entries()) {
    if (removed.has(index)) continue
    if (!marks) { marked.push(picture); continue }
    const mark = marks[index]
    if (!mark) { marked.push(picture); continue }
    await storeImage(media, mark.thumb)
    marked.push({ ...picture, box: mark.box, thumb_key: mark.thumb.key })
  }
  return marked
}

export function positiveId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}
