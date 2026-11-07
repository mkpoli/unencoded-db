export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'

export type SourceImage = {
  bytes: Uint8Array
  type: ImageType
  size: number
}

export type SourceImageResult =
  | { image: SourceImage; error?: never }
  | { image?: never; error: string }

export const MISSING_IMAGE_MESSAGE = 'Choose a source image: a JPEG, PNG or WebP file up to 8 MiB.'
export const EMPTY_IMAGE_MESSAGE = 'The image file is empty.'
export const OVERSIZE_IMAGE_MESSAGE = 'The image is larger than 8 MiB.'
export const UNSUPPORTED_IMAGE_MESSAGE = 'The image must be a JPEG, PNG or WebP file.'

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function ascii(text: string): number[] {
  return [...text].map(character => character.charCodeAt(0))
}

/** Identify a supported image from its magic bytes. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  return null
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object' && value !== null && typeof (value as File).arrayBuffer === 'function' && typeof (value as File).size === 'number'
}

/** Validate the required image field and read its bytes. */
export async function readSourceImage(form: FormData, name = 'image'): Promise<SourceImageResult> {
  const file = form.get(name)
  if (file === null) return { error: MISSING_IMAGE_MESSAGE }
  if (!isFile(file)) return { error: UNSUPPORTED_IMAGE_MESSAGE }
  if (file.size === 0) return { error: EMPTY_IMAGE_MESSAGE }
  if (file.size > MAX_IMAGE_BYTES) return { error: OVERSIZE_IMAGE_MESSAGE }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { error: UNSUPPORTED_IMAGE_MESSAGE }
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: OVERSIZE_IMAGE_MESSAGE }
  if (bytes.byteLength === 0) return { error: EMPTY_IMAGE_MESSAGE }
  const type = detectImageType(bytes)
  if (!type) return { error: UNSUPPORTED_IMAGE_MESSAGE }
  return { image: { bytes, type, size: bytes.byteLength } }
}

/** R2 key for one record image. The key never appears in page data. */
export function createImageKey(): string {
  return `entries/${crypto.randomUUID()}`
}

export async function putSourceImage(bucket: R2Bucket, key: string, image: SourceImage): Promise<void> {
  await bucket.put(key, image.bytes, { httpMetadata: { contentType: image.type } })
}

/** Best-effort cleanup after a failed record insert. */
export async function deleteSourceImage(bucket: R2Bucket, key: string): Promise<void> {
  try {
    await bucket.delete(key)
  } catch {
    // The orphan is untracked; there is no cleanup job yet.
  }
}
