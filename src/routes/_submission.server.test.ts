import { describe, expect, test } from 'bun:test'
import { MEDIA_MAX } from '$lib/limits'
import { uploadedImages } from './_submission.server'

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 20, 0, 0, 0, 20, 8, 6, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
])
const imageFile = () => new File([png], 'image.png', { type: 'image/png' })
const makeForm = () => { const form = new FormData(); form.append('image', imageFile()); return form }
const sized = (height: number) => { const bytes = png.slice(); bytes[19] = height; return new File([bytes], 'image.png', { type: 'image/png' }) }
const bucket = () => {
  const writes: string[] = []
  const media = { put: async (key: string) => { writes.push(key) } } as unknown as R2Bucket
  return { media, writes }
}

describe('uploaded images validation', () => {
  test('rejects an invalid thumbnail without storing the original', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.append('thumb', new File(['not an image'], 'thumb.png'))
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('rejects an invalid crop without storing either image', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.append('thumb', imageFile())
    form.append('box', '[0,0,2,2]')
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('stores a validated image once when the thumbnail shares its key', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.append('thumb', imageFile())
    form.append('box', '[1,2,10,11]')
    const result = await uploadedImages(form, media)
    if (result === 'invalid') throw new Error('expected images')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ image_w: 20, image_h: 20, image_type: 'image/png', box: '[1,2,10,11]' })
    expect(writes).toHaveLength(1)
    expect(result[0].image_key).toBe(result[0].thumb_key)
    expect(writes[0]).toBe(result[0].image_key)
  })

  test('stores both distinct validated images', async () => {
    const form = makeForm(), { media, writes } = bucket()
    const thumb = png.slice(); thumb[19] = 10
    form.append('thumb', new File([thumb], 'thumb.png'))
    const result = await uploadedImages(form, media)
    expect(result).not.toBe('invalid')
    expect(writes).toHaveLength(2)
    expect(writes[0]).not.toBe(writes[1])
  })

  test('rejects a thumbnail without an original', async () => {
    const form = new FormData(), { media, writes } = bucket()
    form.append('thumb', imageFile())
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('a form without a picture holds none, and an empty picker is skipped', async () => {
    const { media, writes } = bucket()
    expect(await uploadedImages(new FormData(), media)).toEqual([])
    const form = new FormData()
    form.append('image', new File([], ''))
    form.append('thumb', new File([], ''))
    expect(await uploadedImages(form, media)).toEqual([])
    expect(writes).toEqual([])
  })

  test('pictures keep their order and each takes its own thumbnail and crop', async () => {
    const form = new FormData(), { media, writes } = bucket()
    form.append('image', sized(20)); form.append('thumb', sized(10)); form.append('box', '[1,2,10,11]')
    form.append('image', sized(30)); form.append('thumb', sized(30)); form.append('box', '')
    const result = await uploadedImages(form, media)
    if (result === 'invalid') throw new Error('expected images')
    expect(result.map(item => item.box)).toEqual(['[1,2,10,11]', null])
    expect(result[0].image_key).not.toBe(result[0].thumb_key)
    expect(result[1].image_key).toBe(result[1].thumb_key)
    expect(new Set(result.map(item => item.image_key)).size).toBe(2)
    expect(writes).toHaveLength(3)
  })

  test('more pictures than a sighting holds are refused before any is stored', async () => {
    const form = new FormData(), { media, writes } = bucket()
    for (let i = 0; i <= MEDIA_MAX; i++) form.append('image', sized(20 + i))
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('one bad picture among good ones stores none', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.append('image', new File(['not an image'], 'bad.png'))
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })
})
