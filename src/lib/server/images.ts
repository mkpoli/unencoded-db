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

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
}

function uint32LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}

function join(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

const PNG_TEXT_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

/** Drop EXIF, XMP, IPTC and comments from a JPEG. Returns null when the segment structure is invalid. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const parts: Uint8Array[] = [bytes.slice(0, 2)]
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === undefined) return null
    if (marker === 0xd9) {
      parts.push(bytes.slice(offset, offset + 2))
      return join(parts)
    }
    if (marker === 0xda) {
      // Entropy-coded data follows the scan header; copy it untouched.
      parts.push(bytes.slice(offset))
      return join(parts)
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.slice(offset, offset + 2))
      offset += 2
      continue
    }
    if (offset + 4 > bytes.length) return null
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) return null
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe
    if (!drop) parts.push(bytes.slice(offset, offset + 2 + length))
    offset += 2 + length
  }
  return null
}

/** Drop text and EXIF chunks from a PNG. Returns null when the chunk structure is invalid. */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!startsWith(bytes, signature) || bytes.length < 8) return null
  const parts: Uint8Array[] = [bytes.slice(0, 8)]
  let offset = 8
  let first = true
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset)
    if (length > bytes.length - offset - 12) return null
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!)
    if (first && type !== 'IHDR') return null
    first = false
    const end = offset + 12 + length
    if (!PNG_TEXT_CHUNKS.has(type)) parts.push(bytes.slice(offset, end))
    offset = end
    if (type === 'IEND') return join(parts)
  }
  return null
}

/** Drop EXIF and XMP chunks from a WebP and fix the RIFF size. */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 20 || !startsWith(bytes, ascii('RIFF')) || !startsWith(bytes, ascii('WEBP'), 8)) return null
  const declared = readUint32LE(bytes, 4)
  const end = 8 + declared
  if (declared < 4 || end > bytes.length || end < 20) return null
  const parts: Uint8Array[] = []
  let offset = 12
  let imageChunks = 0
  while (offset + 8 <= end) {
    const type = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
    const size = readUint32LE(bytes, offset + 4)
    const padded = size + (size % 2)
    if (offset + 8 + padded > end) return null
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') imageChunks++
    if (type === 'VP8X') {
      const chunk = bytes.slice(offset, offset + 8 + padded)
      // Clear the EXIF and XMP flags that no longer have matching chunks.
      chunk[8] = chunk[8]! & ~0x0c
      parts.push(chunk)
    } else if (type !== 'EXIF' && type !== 'XMP ') {
      parts.push(bytes.slice(offset, offset + 8 + padded))
    }
    offset += 8 + padded
  }
  if (offset !== end || imageChunks === 0) return null
  const body = join(parts)
  const riffSize = 4 + body.byteLength
  const header = new Uint8Array([...ascii('RIFF'), ...uint32LE(riffSize), ...ascii('WEBP')])
  return join([header, body])
}

/** Validate the container and remove metadata before storage. */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Uint8Array | null {
  if (type === 'image/jpeg') return stripJpegMetadata(bytes)
  if (type === 'image/png') return stripPngMetadata(bytes)
  return stripWebpMetadata(bytes)
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
  const stripped = stripImageMetadata(bytes, type)
  if (!stripped) return { error: UNSUPPORTED_IMAGE_MESSAGE }
  return { image: { bytes: stripped, type, size: stripped.byteLength } }
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
