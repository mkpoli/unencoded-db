import { describe, expect, test } from 'bun:test'
import { MEDIA_MAX, VIA_MEDIA_MAX } from '$lib/limits'
import { SIGHTING_START } from '$lib/scripts'
import { readSightingFields, type ViaPicture } from '$lib/server/entries'
import { readViaPictures, sightingForms, uploadedImages } from './_submission.server'

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
    form.append('box', '[[0,0,2,2]]')
    expect(await uploadedImages(form, media)).toBe('invalid')
    expect(writes).toEqual([])
  })

  test('stores a validated image once when the thumbnail shares its key', async () => {
    const form = makeForm(), { media, writes } = bucket()
    form.append('thumb', imageFile())
    form.append('box', '[[1,2,10,11],[5,5,6,6]]')
    const result = await uploadedImages(form, media)
    if (result === 'invalid') throw new Error('expected images')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ image_w: 20, image_h: 20, image_type: 'image/png', box: '[[1,2,10,11],[5,5,6,6]]' })
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
    form.append('image', sized(20)); form.append('thumb', sized(10)); form.append('box', '[[1,2,10,11]]')
    form.append('image', sized(30)); form.append('thumb', sized(30)); form.append('box', '')
    const result = await uploadedImages(form, media)
    if (result === 'invalid') throw new Error('expected images')
    expect(result.map(item => item.box)).toEqual(['[[1,2,10,11]]', null])
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

describe('the sightings of a form', () => {
  const entries = (form: FormData) => [...form.entries()].map(([name, value]) => { const item: unknown = value; return [name, item instanceof File ? `file of ${item.size}` : item] })

  test('are the fields between one opening field and the next, in order', () => {
    const form = new FormData()
    form.append('ids', '⿰山東'); form.append('place', 'before any sighting')
    form.append(SIGHTING_START, ''); form.append('image', imageFile()); form.append('thumb', new File([], '')); form.append('box', ''); form.append('place', 'first'); form.append('types', 'mention'); form.append('types', 'reading')
    form.append(SIGHTING_START, ''); form.append('place', 'second'); form.append('via_url', 'https://example.test/post')
    form.append('reading', 'after the sightings'); form.append('radical', '山')
    const [first, second, ...more] = sightingForms(form)
    expect(more).toEqual([])
    expect(entries(first)).toEqual([['image', `file of ${png.length}`], ['thumb', 'file of 0'], ['box', ''], ['place', 'first'], ['types', 'mention'], ['types', 'reading']])
    expect(entries(second)).toEqual([['place', 'second'], ['via_url', 'https://example.test/post']])
  })

  test('a form without an opening field is one sighting', () => {
    const form = new FormData()
    form.append('place', 'only'); form.append('url', 'https://example.test/only')
    expect(sightingForms(form)).toEqual([form])
  })
})

describe('the pictures of the go-betweens of a form', () => {
  const stored = (key: string): ViaPicture => ({ image_key: key, image_type: 'image/png', image_w: 20, image_h: 20, thumb_key: key })
  const via = (author: string, pictures: ViaPicture[]) => ({ url: null, title: null, author, publisher: null, report_date: null, container: null, source_kind: null, quote: null, pictures })
  const row = (form: FormData, author: string, keep: string[] = [], files: File[] = []) => {
    for (const [name, value] of [['via_url', ''], ['via_title', ''], ['via_author', author], ['via_container', ''], ['via_publisher', ''], ['via_source_kind', ''], ['via_report_date', ''], ['via_quote', '']]) form.append(name, value)
    for (const key of keep) form.append('via_keep', key)
    form.append('via_thumb', new File([], ''))
    for (const file of files.length ? files : [new File([], '')]) form.append('via_image', file)
  }
  const keys = (rows: ViaPicture[][]) => rows.map(pictures => pictures.map(picture => picture.image_key))

  test('belong to the row they stand in, wherever it was dragged, and only stored ones are kept', async () => {
    const form = new FormData()
    row(form, '乙', ['b', 'elsewhere'], [sized(30)]); row(form, '丙'); row(form, '甲', ['a'])
    const read = await readViaPictures(form, [via('甲', [stored('a')]), via('乙', [stored('b')])])
    if (typeof read === 'string') throw new Error(read)
    const [file] = read.files
    expect(keys(read.kept)).toEqual([['b'], [], ['a']])
    expect(keys(read.all)).toEqual([['b', file.image.key], [], ['a']])
    expect(read.all[0][1]).toEqual({ image_key: file.image.key, image_type: 'image/png', image_w: 30, image_h: 20, thumb_key: file.image.key })
    expect(readSightingFields(form, read.all).vias.map(item => [item.author, item.pictures?.length ?? 0])).toEqual([['乙', 2], ['丙', 0], ['甲', 1]])
  })

  test('need a source, a readable file and room', async () => {
    const nameless = new FormData(); row(nameless, '', [], [imageFile()])
    expect(await readViaPictures(nameless)).toBe('viaSource')
    const blank = new FormData(); row(blank, '')
    expect(await readViaPictures(blank)).toEqual({ kept: [[]], all: [[]], files: [] })
    const unreadable = new FormData(); row(unreadable, '甲', [], [new File(['no'], 'a.png')])
    expect(await readViaPictures(unreadable)).toBe('image')
    const many = new FormData(); row(many, '甲', [], Array.from({ length: VIA_MEDIA_MAX + 1 }, (_, index) => sized(21 + index)))
    expect(await readViaPictures(many)).toBe('image')
  })

  test('stay with their sighting in a form of several', async () => {
    const form = new FormData()
    form.append(SIGHTING_START, ''); row(form, '甲', [], [sized(31)])
    form.append(SIGHTING_START, ''); row(form, '乙'); row(form, '丙', [], [sized(32)])
    const read = await Promise.all(sightingForms(form).map(section => readViaPictures(section)))
    expect(read.map(result => typeof result === 'string' ? result : result.all.map(pictures => pictures.map(picture => picture.image_w)))).toEqual([[[31]], [[], [32]]])
  })
})
