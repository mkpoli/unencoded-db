export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'

export type SourceImage = {
  bytes: Uint8Array
  type: ImageType
  size: number
}

export type ImageError = 'missing' | 'oversize' | 'unsupported'

export type SourceImageResult =
  | { image: SourceImage; error?: never }
  | { image?: never; error: ImageError }

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

function readTiffOrientation(bytes: Uint8Array, start: number, end: number): number | null {
  if (start + 8 > end) return null
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d
  if (!little && !big) return null
  const u16 = (offset: number) => little
    ? bytes[offset]! | (bytes[offset + 1]! << 8)
    : (bytes[offset]! << 8) | bytes[offset + 1]!
  const u32 = (offset: number) => little
    ? (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
    : ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
  if (u16(start + 2) !== 42) return null
  const ifd = start + u32(start + 4)
  if (ifd + 2 > end) return null
  const count = u16(ifd)
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > end) return null
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3 && u32(entry + 4) === 1) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

/** Read the EXIF orientation before stripping, so phone photos do not turn sideways. */
export function readJpegOrientation(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === undefined || marker === 0xda || marker === 0xd9) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) return null
    if (marker === 0xe1 && startsWith(bytes, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00], offset + 4)) {
      return readTiffOrientation(bytes, offset + 10, offset + 2 + length)
    }
    offset += 2 + length
  }
  return null
}

function orientationSegment(orientation: number): Uint8Array {
  const tiff = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  const data = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
  const length = data.length + 2
  return new Uint8Array([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...data])
}

/** Drop EXIF, XMP, IPTC and comments from a JPEG, keeping only EXIF orientation. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const orientation = readJpegOrientation(bytes)
  const parts: Uint8Array[] = [bytes.slice(0, 2)]
  if (orientation !== null && orientation !== 1) parts.push(orientationSegment(orientation))
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

/** Validate the image field and read its bytes. */
export async function readSourceImage(form: FormData, name = 'image'): Promise<SourceImageResult> {
  const file = form.get(name)
  if (file === null) return { error: 'missing' }
  // An untouched file input arrives as an empty string on Workers; an empty
  // file arrives with no bytes. Neither is a picture, so a link can stand in.
  if (typeof file === 'string') return file === '' ? { error: 'missing' } : { error: 'unsupported' }
  if (!isFile(file)) return { error: 'unsupported' }
  if (file.size === 0) return { error: 'missing' }
  if (file.size > MAX_IMAGE_BYTES) return { error: 'oversize' }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { error: 'unsupported' }
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: 'oversize' }
  const type = detectImageType(bytes)
  if (!type) return { error: 'unsupported' }
  const stripped = stripImageMetadata(bytes, type)
  if (!stripped) return { error: 'unsupported' }
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
