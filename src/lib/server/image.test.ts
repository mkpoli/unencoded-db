import { describe, expect, test } from 'bun:test'
import { sniff, stripMetadata } from './image'

const bytes = (...parts: (number[] | string)[]) => new Uint8Array(parts.flatMap(part => typeof part === 'string' ? [...new TextEncoder().encode(part)] : part))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const has = (b: Uint8Array, text: string) => new TextDecoder('latin1').decode(b).includes(text)

const pngChunk = (name: string, data: number[]) => [...be32(data.length), ...new TextEncoder().encode(name), ...data, 0, 0, 0, 0]
const png = bytes([0x89], 'PNG', [13, 10, 26, 10], pngChunk('IHDR', [...be32(640), ...be32(480), 8, 6, 0, 0, 0]), pngChunk('eXIf', [...new TextEncoder().encode('GPSDATA')]), pngChunk('IDAT', [1, 2, 3]), pngChunk('IEND', []))

const app1 = [...new TextEncoder().encode('Exif\0\0GPSDATA')]
const jpeg = bytes([0xff, 0xd8], [0xff, 0xe1, 0, app1.length + 2], app1, [0xff, 0xe0, 0, 4, 1, 2], [0xff, 0xc0, 0, 11, 8, 1, 0xe0, 2, 0x80, 1, 1, 0x11, 0], [0xff, 0xda, 0, 2], [9, 9, 9], [0xff, 0xd9])

const webpChunk = (name: string, data: number[]) => [...new TextEncoder().encode(name), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])]
const vp8x = [0x0c, 0, 0, 0, 639 & 255, 639 >> 8, 0, 479 & 255, 479 >> 8, 0]
const webpBody = [...webpChunk('VP8X', vp8x), ...webpChunk('VP8L', [1, 2]), ...webpChunk('EXIF', [...new TextEncoder().encode('GPSDATA')])]
const webp = bytes('RIFF', le32(4 + webpBody.length), 'WEBP', webpBody)

describe('an upload is what its bytes say', () => {
  test('PNG', () => expect(sniff(png)).toEqual({ type: 'image/png', width: 640, height: 480 }))
  test('JPEG', () => expect(sniff(jpeg)).toEqual({ type: 'image/jpeg', width: 640, height: 480 }))
  test('WebP', () => expect(sniff(webp)).toEqual({ type: 'image/webp', width: 640, height: 480 }))
  test('a page or a script named .png is not an image', () => {
    expect(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">0000000000000000000'))).toBeNull()
    expect(sniff(bytes('<!doctype html><script>alert(1)</script>00000000000000'))).toBeNull()
  })
})

describe('a camera\'s metadata does not survive', () => {
  for (const [name, file, type] of [['PNG', png, 'image/png'], ['JPEG', jpeg, 'image/jpeg'], ['WebP', webp, 'image/webp']] as const) test(name, () => {
    expect(has(file, 'GPSDATA')).toBe(true)
    const out = stripMetadata(file, type)
    expect(has(out, 'GPSDATA')).toBe(false)
    expect(sniff(out)).toEqual({ type, width: 640, height: 480 })
  })

  test('rejects an oversized WebP chunk without looping', () => {
    const malformed = bytes('RIFF', le32(30), 'WEBP', 'VP8X', le32(0xfffffff8), vp8x)
    expect(() => stripMetadata(malformed, 'image/webp')).toThrow('Invalid WebP chunk')
  })

  test('WebP says its new length and no longer flags the removed chunk', () => {
    const out = stripMetadata(webp, 'image/webp')
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8)
    expect(out[20] & 0x0c).toBe(0)
  })

  test('JPEG strips metadata after marker fill bytes', () => {
    const filled = bytes([0xff, 0xd8, 0xff], [...jpeg.subarray(2)])
    expect(sniff(filled)).toEqual({ type: 'image/jpeg', width: 640, height: 480 })
    const out = stripMetadata(filled, 'image/jpeg')
    expect(has(out, 'GPSDATA')).toBe(false)
    expect(sniff(out)).toEqual({ type: 'image/jpeg', width: 640, height: 480 })
  })

  test('JPEG strips metadata between progressive scans and preserves scan bytes', () => {
    const firstScan = [7, 0xff, 0x00, 8, 0xff, 0xd0, 9]
    const secondScan = [3, 0xff, 0x00, 4]
    const progressive = bytes([...jpeg.subarray(0, jpeg.length - 5)], firstScan,
      [0xff, 0xff, 0xe1, 0, app1.length + 2], app1,
      [0xff, 0xda, 0, 2], secondScan, [0xff, 0xd9])
    const out = stripMetadata(progressive, 'image/jpeg')
    expect(has(out, 'GPSDATA')).toBe(false)
    expect([...out.subarray(-secondScan.length - 2)]).toEqual([...secondScan, 0xff, 0xd9])
    expect(out.some((_, i) => firstScan.every((byte, j) => out[i + j] === byte))).toBe(true)
  })

  test('JPEG rejects truncated scans and malformed inter-scan segments', () => {
    expect(() => stripMetadata(jpeg.subarray(0, jpeg.length - 2), 'image/jpeg')).toThrow()
    const malformed = bytes([...jpeg.subarray(0, jpeg.length - 2)], [0xff, 0xe1, 0xff, 0xff, 1])
    expect(() => stripMetadata(malformed, 'image/jpeg')).toThrow()
  })

  test('JPEG keeps the image data after the scan marker', () => {
    const out = stripMetadata(jpeg, 'image/jpeg')
    expect([...out.subarray(-5)]).toEqual([9, 9, 9, 0xff, 0xd9])
  })
})
