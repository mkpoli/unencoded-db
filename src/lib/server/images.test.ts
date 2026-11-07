import { describe, expect, test } from 'bun:test'
import { JPEG_BYTES, PNG_BYTES, WEBP_BYTES, imageFile } from '../../test-support'
import {
  EMPTY_IMAGE_MESSAGE,
  MAX_IMAGE_BYTES,
  MISSING_IMAGE_MESSAGE,
  OVERSIZE_IMAGE_MESSAGE,
  UNSUPPORTED_IMAGE_MESSAGE,
  createImageKey,
  detectImageType,
  readSourceImage,
} from './images'

function formWith(file?: File): FormData {
  const form = new FormData()
  if (file) form.set('image', file)
  return form
}

describe('image magic bytes', () => {
  test('recognizes JPEG, PNG and WebP', () => {
    expect(detectImageType(JPEG_BYTES)).toBe('image/jpeg')
    expect(detectImageType(PNG_BYTES)).toBe('image/png')
    expect(detectImageType(WEBP_BYTES)).toBe('image/webp')
  })

  test('rejects SVG, HTML, empty and truncated data', () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(detectImageType(new TextEncoder().encode('<!doctype html><html></html>'))).toBeNull()
    expect(detectImageType(new Uint8Array())).toBeNull()
    expect(detectImageType(PNG_BYTES.slice(0, 7))).toBeNull()
    expect(detectImageType(WEBP_BYTES.slice(0, 11))).toBeNull()
    expect(detectImageType(new TextEncoder().encode('not an image'))).toBeNull()
  })
})

describe('source image validation', () => {
  test('accepts each supported image type by content', async () => {
    for (const [bytes, type] of [[JPEG_BYTES, 'image/jpeg'], [PNG_BYTES, 'image/png'], [WEBP_BYTES, 'image/webp']] as const) {
      const result = await readSourceImage(formWith(imageFile(bytes, 'source.bin', 'application/octet-stream')))
      expect(result.image?.type).toBe(type)
      expect(result.image?.size).toBe(bytes.byteLength)
      expect(result.image?.bytes).toEqual(bytes)
    }
  })

  test('requires an image', async () => {
    const result = await readSourceImage(formWith())
    expect(result.error).toBe(MISSING_IMAGE_MESSAGE)
  })

  test('rejects an empty file', async () => {
    const result = await readSourceImage(formWith(imageFile(new Uint8Array(), 'empty.png')))
    expect(result.error).toBe(EMPTY_IMAGE_MESSAGE)
  })

  test('rejects SVG and HTML even with an image filename or type', async () => {
    const svg = await readSourceImage(formWith(imageFile(new TextEncoder().encode('<svg></svg>'), 'source.png', 'image/png')))
    expect(svg.error).toBe(UNSUPPORTED_IMAGE_MESSAGE)
    const html = await readSourceImage(formWith(imageFile(new TextEncoder().encode('<html></html>'), 'source.jpg', 'image/jpeg')))
    expect(html.error).toBe(UNSUPPORTED_IMAGE_MESSAGE)
  })

  test('accepts exactly 8 MiB, strips padding and rejects one byte more', async () => {
    const boundary = new Uint8Array(MAX_IMAGE_BYTES)
    boundary.set(PNG_BYTES)
    const accepted = await readSourceImage(formWith(imageFile(boundary)))
    expect(accepted.image?.type).toBe('image/png')
    expect(accepted.image?.size).toBe(PNG_BYTES.byteLength)

    const oversize = new Uint8Array(MAX_IMAGE_BYTES + 1)
    oversize.set(PNG_BYTES)
    const rejected = await readSourceImage(formWith(imageFile(oversize)))
    expect(rejected.error).toBe(OVERSIZE_IMAGE_MESSAGE)
  })

  test('removes EXIF, XMP and text metadata', async () => {
    const jpegExif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50, 0x53]
    const jpegLength = jpegExif.length + 2
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, jpegLength >> 8, jpegLength & 0xff, ...jpegExif, ...JPEG_BYTES.slice(2)])
    const jpegResult = await readSourceImage(formWith(imageFile(jpeg)))
    expect(jpegResult.image?.type).toBe('image/jpeg')
    expect(jpegResult.image?.bytes).toEqual(JPEG_BYTES)

    const text = new TextEncoder().encode('Comment\u0000secret')
    const png = new Uint8Array(PNG_BYTES.length + 12 + text.length)
    png.set(PNG_BYTES.slice(0, 33))
    const view = new DataView(png.buffer)
    view.setUint32(33, text.length)
    png.set(new TextEncoder().encode('tEXt'), 37)
    png.set(text, 41)
    png.set(PNG_BYTES.slice(33), 45 + text.length)
    const pngResult = await readSourceImage(formWith(imageFile(png)))
    expect(pngResult.image?.type).toBe('image/png')
    expect(pngResult.image?.bytes).toEqual(PNG_BYTES)

    const xmp = new TextEncoder().encode('<x:xmpmeta>secret</x:xmpmeta>')
    const webp = new Uint8Array(WEBP_BYTES.length + 8 + xmp.length + (xmp.length % 2))
    webp.set(WEBP_BYTES.slice(0, 12))
    webp.set(new TextEncoder().encode('EXIF'), 12)
    webp.set([xmp.length & 0xff, (xmp.length >> 8) & 0xff, (xmp.length >> 16) & 0xff, (xmp.length >> 24) & 0xff], 16)
    webp.set(xmp, 20)
    const webpRest = 20 + xmp.length + (xmp.length % 2)
    webp.set(WEBP_BYTES.slice(12), webpRest)
    const riffSize = webp.length - 8
    webp.set([riffSize & 0xff, (riffSize >> 8) & 0xff, (riffSize >> 16) & 0xff, (riffSize >> 24) & 0xff], 4)
    const webpResult = await readSourceImage(formWith(imageFile(webp)))
    expect(webpResult.image?.type).toBe('image/webp')
    expect(webpResult.image?.bytes).toEqual(WEBP_BYTES)
  })

  test('rejects a payload that only starts with an image signature', async () => {
    const html = new TextEncoder().encode('<html><body>not an image</body></html>')
    for (const [prefix, name] of [[[0xff, 0xd8, 0xff], 'fake.jpg'], [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'fake.png'], [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'fake.webp']] as const) {
      const file = new Uint8Array(prefix.length + html.length)
      file.set(prefix)
      file.set(html, prefix.length)
      const result = await readSourceImage(formWith(imageFile(file, name)))
      expect(result.error).toBe(UNSUPPORTED_IMAGE_MESSAGE)
    }
  })
})

describe('image keys', () => {
  test('uses a random entries/ key', () => {
    const first = createImageKey()
    const second = createImageKey()
    expect(first).toMatch(/^entries\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(second).not.toBe(first)
  })
})
