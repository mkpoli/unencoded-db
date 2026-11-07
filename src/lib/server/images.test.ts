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

  test('accepts exactly 8 MiB and rejects one byte more', async () => {
    const boundary = new Uint8Array(MAX_IMAGE_BYTES)
    boundary.set(PNG_BYTES)
    const accepted = await readSourceImage(formWith(imageFile(boundary)))
    expect(accepted.image?.size).toBe(MAX_IMAGE_BYTES)

    const oversize = new Uint8Array(MAX_IMAGE_BYTES + 1)
    oversize.set(PNG_BYTES)
    const rejected = await readSourceImage(formWith(imageFile(oversize)))
    expect(rejected.error).toBe(OVERSIZE_IMAGE_MESSAGE)
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
