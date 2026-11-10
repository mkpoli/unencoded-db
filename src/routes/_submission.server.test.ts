import { describe, expect, test } from 'bun:test'
import { uploadedImage } from './_submission.server'

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 20, 0, 0, 0, 20, 8, 6, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
])
const imageFile = () => new File([png], 'image.png', { type: 'image/png' })
const makeForm = () => { const form = new FormData(); form.set('image', imageFile()); return form }
const bucket = () => {
  const writes: string[] = []
  const media = { put: async (key: string) => { writes.push(key) } } as unknown as R2Bucket
  return { media, writes }
}

describe('uploaded image validation', () => {
  test('rejects an invalid thumbnail without storing the original', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.set('thumb', new File(['not an image'], 'thumb.png'))
    expect(await uploadedImage(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('rejects an invalid crop without storing either image', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.set('thumb', imageFile())
    form.set('box', '[0,0,2,2]')
    expect(await uploadedImage(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('stores a validated image once when the thumbnail shares its key', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.set('thumb', imageFile())
    form.set('box', '[1,2,10,11]')
    const result = await uploadedImage(form, media)
    expect(result).toMatchObject({ image_w: 20, image_h: 20, image_type: 'image/png', box: '[1,2,10,11]' })
    expect(writes).toHaveLength(1)
    if (!result || result === 'invalid') throw new Error('expected image')
    expect(result.image_key).toBe(result.thumb_key)
    expect(writes[0]).toBe(result.image_key)
  })

  test('stores both distinct validated images', async () => {
    const form = makeForm(), { media, writes } = bucket()
    const thumb = png.slice(); thumb[19] = 10
    form.set('thumb', new File([thumb], 'thumb.png'))
    const result = await uploadedImage(form, media)
    expect(result).not.toBe('invalid')
    expect(writes).toHaveLength(2)
    expect(writes[0]).not.toBe(writes[1])
  })

  test('rejects a thumbnail without an original', async () => {
    const form = new FormData(), { media, writes } = bucket()
    form.set('thumb', imageFile())
    expect(await uploadedImage(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })
})
