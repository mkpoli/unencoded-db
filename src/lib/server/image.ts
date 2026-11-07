// Check image containers and remove common metadata before storing uploads.
// Container checks do not decode image pixels or guarantee removal of all personal information.
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp'
export type Sniffed = { type: ImageType; width: number; height: number }

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const tag = (b: Uint8Array, i: number, n = 4) => String.fromCharCode(...b.subarray(i, i + n))

export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length > 24 && b[0] === 0x89 && tag(b, 1, 3) === 'PNG' && tag(b, 12) === 'IHDR') return { type: 'image/png', width: u32(b, 16), height: u32(b, 20) }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      if (marker === 0xff) { i++; continue }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: 'image/jpeg', height: u16(b, i + 5), width: u16(b, i + 7) }
      i += 2 + u16(b, i + 2)
    }
    return null
  }
  if (b.length > 30 && tag(b, 0) === 'RIFF' && tag(b, 8) === 'WEBP') {
    const kind = tag(b, 12)
    if (kind === 'VP8X') return { type: 'image/webp', width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
    if (kind === 'VP8 ') return { type: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
  }
  return null
}

function stripJpeg(b: Uint8Array, rejectExif = false) {
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2, inScan = false, sawScan = false
  while (i < b.length) {
    const fromScan: boolean = inScan
    if (inScan) {
      const start = i
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue }
        let markerAt = i + 1
        while (markerAt < b.length && b[markerAt] === 0xff) markerAt++
        if (markerAt >= b.length) throw new Error('Invalid JPEG scan')
        const marker = b[markerAt]
        if (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)) { i = markerAt + 1; continue }
        break
      }
      parts.push(b.subarray(start, i))
      inScan = false
    }
    if (i >= b.length || b[i] !== 0xff) throw new Error('Invalid JPEG marker')
    let markerAt = i + 1
    while (markerAt < b.length && b[markerAt] === 0xff) markerAt++
    if (markerAt >= b.length) throw new Error('Invalid JPEG marker')
    const marker = b[markerAt]
    if (marker === 0xd9) {
      if (!sawScan) throw new Error('Invalid JPEG scan')
      parts.push(b.subarray(i, markerAt + 1))
      return join(parts)
    }
    if (marker === 0x01) {
      parts.push(b.subarray(i, markerAt + 1))
      i = markerAt + 1
      inScan = fromScan
      continue
    }
    if (marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || markerAt + 2 >= b.length) throw new Error('Invalid JPEG segment')
    const length = u16(b, markerAt + 1)
    const end = markerAt + 1 + length
    if (length < 2 || end > b.length) throw new Error('Invalid JPEG segment')
    // Removing orientation without rotating pixels would alter the evidence.
    if (rejectExif && marker === 0xe1) throw new Error('Image metadata requires normalization')
    // APP1 holds Exif and XMP, APP13 Photoshop's IPTC, and a comment is free text. APP2 stays for its colour profile.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(b.subarray(i, end))
    i = end
    if (marker === 0xda) { inScan = true; sawScan = true }
    // DNL may interrupt entropy-coded data without ending the scan.
    if (marker === 0xdc && fromScan) inScan = true
  }
  throw new Error('Invalid JPEG: missing end marker')
}

function stripPng(b: Uint8Array) {
  const parts: Uint8Array[] = [b.subarray(0, 8)]
  for (let i = 8; i + 12 <= b.length;) {
    const end = i + 12 + u32(b, i)
    if (!['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(tag(b, i + 4))) parts.push(b.subarray(i, end))
    i = end
  }
  return join(parts)
}

function stripWebp(b: Uint8Array) {
  const parts: Uint8Array[] = [b.subarray(0, 12)]
  for (let i = 12; i + 8 <= b.length;) {
    const size = new DataView(b.buffer, b.byteOffset + i + 4, 4).getUint32(0, true)
    const end = i + 8 + size + (size % 2)
    if (end > b.length) throw new Error('Invalid WebP chunk')
    if (!['EXIF', 'XMP '].includes(tag(b, i))) parts.push(b.subarray(i, end))
    i = end
  }
  const out = join(parts)
  new DataView(out.buffer).setUint32(4, out.length - 8, true)
  // A VP8X header still flagging the chunks removed would promise what the file no longer has.
  if (tag(out, 12) === 'VP8X') out[20] &= ~0x0c
  return out
}

function join(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) { out.set(part, at); at += part.length }
  return out
}

export function stripMetadata(bytes: Uint8Array, type: ImageType) {
  return type === 'image/jpeg' ? stripJpeg(bytes) : type === 'image/png' ? stripPng(bytes) : stripWebp(bytes)
}

export const EXTENSIONS: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const TYPE_OF_EXTENSION: Record<string, ImageType> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export const MAX_IMAGE = 15 * 1024 * 1024
export const MAX_THUMB = 1024 * 1024
export const MAX_SIDE = 12000

export async function hashHex(bytes: Uint8Array | string) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function validPng(b: Uint8Array): boolean {
  if (b.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return false
  let at = 8, header = false, image = false, ended = false
  while (at + 12 <= b.length) {
    const size = u32(b, at), name = tag(b, at + 4), end = at + 12 + size
    if (end > b.length || ended || (!header && (name !== 'IHDR' || size !== 13))) return false
    let crc = 0xffffffff
    for (let i = at + 4; i < end - 4; i++) {
      crc ^= b[i]
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    if (((crc ^ 0xffffffff) >>> 0) !== u32(b, end - 4)) return false
    if (name === 'IHDR') { if (header) return false; header = true }
    if (['eXIf', 'tEXt', 'zTXt', 'iTXt', 'acTL', 'fcTL', 'fdAT'].includes(name)) return false
    if (name === 'IDAT') image ||= size > 0
    if (name === 'IEND') { if (size !== 0 || !image) return false; ended = true }
    at = end
  }
  return ended && at === b.length
}

function validWebp(b: Uint8Array): boolean {
  if (b.length < 20 || new DataView(b.buffer, b.byteOffset + 4, 4).getUint32(0, true) !== b.length - 8) return false
  let at = 12, image = false
  while (at + 8 <= b.length) {
    const name = tag(b, at), size = new DataView(b.buffer, b.byteOffset + at + 4, 4).getUint32(0, true)
    const end = at + 8 + size + (size % 2)
    if (end > b.length || name === 'EXIF' || name === 'XMP ' || name === 'ANIM' || name === 'ANMF') return false
    if (name === 'VP8X' && (size !== 10 || (b[at + 8] & 2))) return false
    if (name === 'VP8 ' && size >= 10 && b[at + 11] === 0x9d && b[at + 12] === 0x01 && b[at + 13] === 0x2a) image = true
    if (name === 'VP8L' && size >= 5 && b[at + 8] === 0x2f) image = true
    at = end
  }
  return image && at === b.length
}

// Prepare the image before any object is written.
export async function prepareImage(file: File, limit: number) {
  if (file.size === 0 || file.size > limit) return null
  const raw = new Uint8Array(await file.arrayBuffer())
  const found = sniff(raw)
  if (!found || found.width < 1 || found.height < 1 || found.width > MAX_SIDE || found.height > MAX_SIDE) return null
  if (found.type === 'image/png' && !validPng(raw)) return null
  if (found.type === 'image/webp' && !validWebp(raw)) return null
  let bytes: Uint8Array
  try { bytes = found.type === 'image/jpeg' ? stripJpeg(raw, true) : stripMetadata(raw, found.type) } catch { return null }
  const key = `${await hashHex(bytes)}.${EXTENSIONS[found.type]}`
  return { key, bytes, ...found }
}

export async function storeImage(media: Pick<R2Bucket, 'put'>, image: NonNullable<Awaited<ReturnType<typeof prepareImage>>>) {
  await media.put(image.key, image.bytes, { httpMetadata: { contentType: image.type } })
}
