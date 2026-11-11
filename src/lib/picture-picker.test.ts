import { describe, expect, test } from 'bun:test'
import { PicturePickerState, beginPointerBox, preventPendingSubmit } from './picture-picker'
import type { Box, Prepared } from './picture'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture() {
  const preparations: ReturnType<typeof deferred<Prepared>>[] = []
  const thumbnails: { bitmap: ImageBitmap; box: Box | null; result: ReturnType<typeof deferred<File>> }[] = []
  let state!: { picture: Prepared | null; box: Box | null; thumb: File | null; busy: boolean; bad: boolean; thumbnailBad: boolean }
  const picker = new PicturePickerState(value => { state = value }, {
    prepare: () => { const result = deferred<Prepared>(); preparations.push(result); return result.promise },
    thumbnail: (bitmap, box) => { const result = deferred<File>(); thumbnails.push({ bitmap, box, result }); return result.promise },
  })
  const picture = (name: string): Prepared => ({ file: new File([name], name), bitmap: { name } as unknown as ImageBitmap, width: 100, height: 100 })
  const thumb = (name: string) => new File([name], name)
  const tick = () => Promise.resolve()
  return { picker, preparations, thumbnails, picture, thumb, tick, get state() { return state } }
}

async function selected(f: ReturnType<typeof fixture>, name = 'a') {
  const pending = f.picker.take(new Blob())
  const picture = f.picture(name)
  f.preparations.at(-1)!.resolve(picture)
  await f.tick()
  f.thumbnails.at(-1)!.result.resolve(f.thumb(`${name}-whole`))
  await pending
  return picture
}

describe('picture selection and thumbnail readiness', () => {
  test('pending processing prevents native and enhanced submit handlers; ready submits reach them', async () => {
    const f = fixture()
    const form = new EventTarget()
    let enhanced = 0, other = 0
    // SvelteKit's enhancer is a normal submit listener and proceeds even when default is prevented.
    form.addEventListener('submit', () => { enhanced++ })
    form.addEventListener('submit', () => { other++ })
    form.addEventListener('submit', event => preventPendingSubmit(event, f.state.busy), true)
    const pending = f.picker.take(new Blob())
    const duringPrepare = new Event('submit', { cancelable: true })
    expect(form.dispatchEvent(duringPrepare)).toBe(false)
    expect([enhanced, other]).toEqual([0, 0])
    f.preparations[0].resolve(f.picture('a'))
    await f.tick()
    expect(form.dispatchEvent(new Event('submit', { cancelable: true }))).toBe(false)
    expect([enhanced, other]).toEqual([0, 0])
    f.thumbnails[0].result.resolve(f.thumb('whole'))
    await pending
    expect(form.dispatchEvent(new Event('submit', { cancelable: true }))).toBe(true)
    expect([enhanced, other]).toEqual([1, 1])
  })

  test('only the latest overlapping selection can finish or release readiness', async () => {
    const f = fixture()
    const first = f.picker.take(new Blob(['first']))
    const second = f.picker.take(new Blob(['second']))
    const b = f.picture('b')
    f.preparations[1].resolve(b)
    await f.tick()
    f.preparations[0].resolve(f.picture('a'))
    await first
    expect(f.state.picture).toBe(b)
    expect(f.state.busy).toBe(true)
    expect(f.thumbnails).toHaveLength(1)
    f.thumbnails[0].result.resolve(f.thumb('b-whole'))
    await second
    expect(f.state.thumb?.name).toBe('b-whole')
    expect(f.state.busy).toBe(false)
  })

  test('an older selection cannot overwrite a fully finished newer selection', async () => {
    const f = fixture()
    const first = f.picker.take(new Blob())
    const second = f.picker.take(new Blob())
    const newest = f.picture('newest')
    f.preparations[1].resolve(newest)
    await f.tick()
    const newestThumb = f.thumb('newest-thumb')
    f.thumbnails[0].result.resolve(newestThumb)
    await second
    f.preparations[0].resolve(f.picture('older'))
    await first
    expect(f.state).toMatchObject({ picture: newest, thumb: newestThumb, box: null, busy: false, bad: false })
    expect(f.thumbnails).toHaveLength(1)
  })

  test('stale preparation errors and thumbnails cannot affect a newer selection', async () => {
    const f = fixture()
    const a = f.picker.take(new Blob())
    f.preparations[0].resolve(f.picture('a'))
    await f.tick()
    const b = f.picker.take(new Blob())
    f.thumbnails[0].result.resolve(f.thumb('a-whole'))
    await a
    expect(f.state.busy).toBe(true)
    expect(f.state.thumb).toBeNull()
    f.preparations[1].resolve(f.picture('b'))
    await f.tick()
    f.thumbnails[1].result.resolve(f.thumb('b-whole'))
    await b
    const old = f.picker.take(new Blob())
    const latest = f.picker.take(new Blob())
    f.preparations[2].reject(new Error('old failure'))
    await old
    expect(f.state.bad).toBe(false)
    expect(f.state.busy).toBe(true)
    f.preparations[3].resolve(f.picture('c'))
    await f.tick()
    f.thumbnails[2].result.resolve(f.thumb('c-whole'))
    await latest
    expect(f.state.picture?.file.name).toBe('c')
  })

  test('clearing an unreadable image clears its error', async () => {
    const f = fixture()
    const pending = f.picker.take(new Blob())
    f.preparations[0].reject(new Error('decode'))
    await pending
    expect(f.state).toMatchObject({ picture: null, bad: true, thumbnailBad: false })
    f.picker.clear()
    expect(f.state).toMatchObject({ picture: null, bad: false, thumbnailBad: false })
  })

  test('removal invalidates preparation and thumbnail work', async () => {
    const f = fixture()
    const a = f.picker.take(new Blob())
    f.picker.clear()
    f.preparations[0].resolve(f.picture('a'))
    await a
    expect(f.state).toMatchObject({ picture: null, thumb: null, box: null, busy: false })
    const b = f.picker.take(new Blob())
    f.preparations[1].resolve(f.picture('b'))
    await f.tick()
    f.picker.clear()
    f.thumbnails[0].result.reject(new Error('late failure'))
    await b
    expect(f.state).toMatchObject({ picture: null, thumb: null, box: null, busy: false, bad: false })
  })

  test('replacing an existing image blocks drawing and removal cancels replacement', async () => {
    const f = fixture()
    const original = await selected(f)
    const replacement = f.picker.take(new Blob())
    expect(f.state).toMatchObject({ picture: original, thumb: null, busy: true })
    expect(f.picker.beginBox()).toBeNull()
    f.picker.clear()
    f.preparations[1].resolve(f.picture('replacement'))
    await replacement
    expect(f.state).toMatchObject({ picture: null, box: null, thumb: null, busy: false })
  })

  test('a superseded draw cannot mutate or release a replacement', async () => {
    const f = fixture()
    await selected(f)
    const generation = f.picker.beginBox()!
    const replacement = f.picker.take(new Blob())
    f.picker.moveBox(generation, [2, 2, 30, 30])
    await f.picker.endBox(generation)
    expect(f.state).toMatchObject({ busy: true, box: null, thumb: null })
    expect(f.thumbnails).toHaveLength(1)
    f.preparations[1].resolve(f.picture('b'))
    await f.tick()
    f.thumbnails[1].result.resolve(f.thumb('b-whole'))
    await replacement
    expect(f.state.picture?.file.name).toBe('b')
  })

  test('a cleared draw cannot mutate the replacement whole-image thumbnail', async () => {
    const f = fixture()
    await selected(f)
    const generation = f.picker.beginBox()!
    f.picker.moveBox(generation, [2, 2, 30, 30])
    const clear = f.picker.clearBox()
    f.picker.moveBox(generation, [10, 10, 40, 40])
    await f.picker.endBox(generation)
    expect(f.state).toMatchObject({ busy: true, box: null, thumb: null })
    expect(f.thumbnails).toHaveLength(2)
    f.thumbnails[1].result.resolve(f.thumb('whole'))
    await clear
    expect(f.state).toMatchObject({ box: null, busy: false })
  })

  test('failed thumbnail encoding restores the last complete crop and image', async () => {
    const f = fixture()
    const picture = await selected(f)
    const first = f.picker.beginBox()!
    const box: Box = [3, 4, 25, 35]
    f.picker.moveBox(first, box)
    const crop = f.picker.endBox(first)
    const savedThumb = f.thumb('saved')
    f.thumbnails[1].result.resolve(savedThumb)
    await crop
    const clear = f.picker.clearBox()
    f.thumbnails[2].result.reject(new Error('encode'))
    await clear
    expect(f.state).toMatchObject({ picture, box, thumb: savedThumb, busy: false, bad: true, thumbnailBad: true })
    f.picker.clear()
    expect(f.state).toMatchObject({ picture: null, bad: false, thumbnailBad: false })
  })

  test('capture failures and ineligible pointers do not begin drawing', async () => {
    const f = fixture()
    await selected(f)
    let prevented = 0, captured = 0
    const event = { isPrimary: true, button: 0, pointerId: 1, preventDefault() { prevented++ } }
    const stage = { setPointerCapture() { captured++; throw new Error('pointer no longer active') }, releasePointerCapture() {} }
    expect(beginPointerBox(f.picker, stage, { ...event, isPrimary: false })).toBeNull()
    expect(beginPointerBox(f.picker, stage, { ...event, button: 2 })).toBeNull()
    expect(captured).toBe(0)
    expect(beginPointerBox(f.picker, stage, event)).toBeNull()
    expect(f.state).toMatchObject({ busy: false, box: null, thumb: { name: 'a-whole' } })
    expect(prevented).toBe(0)
    let released = 0
    const goodStage = { setPointerCapture() { captured++ }, releasePointerCapture() { released++ } }
    const replacement = f.picker.take(new Blob())
    expect(beginPointerBox(f.picker, goodStage, event)).toBeNull()
    expect(released).toBe(1)
    f.picker.clear()
    f.preparations[1].resolve(f.picture('late'))
    await replacement
  })

  test('ending a draw more than once only starts one thumbnail', async () => {
    const f = fixture()
    await selected(f)
    const generation = f.picker.beginBox()!
    f.picker.moveBox(generation, [2, 2, 30, 30])
    const first = f.picker.endBox(generation)
    await f.picker.endBox(generation)
    expect(f.thumbnails).toHaveLength(2)
    expect(f.state.busy).toBe(true)
    f.thumbnails[1].result.resolve(f.thumb('crop'))
    await first
    expect(f.state.busy).toBe(false)
  })

  test('drawing and overlapping crops hold readiness until the latest thumbnail', async () => {
    const f = fixture()
    const picture = await selected(f)
    const firstGeneration = f.picker.beginBox()!
    expect(f.state).toMatchObject({ busy: true, box: null, thumb: null })
    const firstBox: Box = [10, 12, 30, 40]
    f.picker.moveBox(firstGeneration, firstBox)
    const first = f.picker.endBox(firstGeneration)
    expect(f.thumbnails[1]).toMatchObject({ bitmap: picture.bitmap, box: firstBox })
    const secondGeneration = f.picker.beginBox()!
    const secondBox: Box = [5, 6, 50, 60]
    f.picker.moveBox(secondGeneration, secondBox)
    const second = f.picker.endBox(secondGeneration)
    f.thumbnails[1].result.resolve(f.thumb('old-crop'))
    await first
    expect(f.state).toMatchObject({ box: secondBox, thumb: null, busy: true })
    f.thumbnails[2].result.resolve(f.thumb('new-crop'))
    await second
    expect(f.state).toMatchObject({ box: secondBox, busy: false })
    expect(f.state.thumb?.name).toBe('new-crop')
  })

  test('clear crop supersedes a pending crop, and a tiny crop uses the whole image', async () => {
    const f = fixture()
    await selected(f)
    const generation = f.picker.beginBox()!
    f.picker.moveBox(generation, [1, 2, 20, 30])
    const crop = f.picker.endBox(generation)
    const clear = f.picker.clearBox()
    f.thumbnails[1].result.resolve(f.thumb('crop'))
    await crop
    expect(f.state).toMatchObject({ box: null, thumb: null, busy: true })
    expect(f.thumbnails[2].box).toBeNull()
    f.thumbnails[2].result.resolve(f.thumb('cleared'))
    await clear
    expect(f.state.thumb?.name).toBe('cleared')
    const tinyGeneration = f.picker.beginBox()!
    f.picker.moveBox(tinyGeneration, [1, 2, 3, 30])
    const tiny = f.picker.endBox(tinyGeneration)
    expect(f.state).toMatchObject({ box: null, busy: true })
    expect(f.thumbnails[3].box).toBeNull()
    f.thumbnails[3].result.resolve(f.thumb('whole'))
    await tiny
    expect(f.state.busy).toBe(false)
  })

  test('crop can supersede the first thumbnail; failure and disposal do not publish stale work', async () => {
    const f = fixture()
    const initial = f.picker.take(new Blob())
    f.preparations[0].resolve(f.picture('a'))
    await f.tick()
    const generation = f.picker.beginBox()!
    f.picker.moveBox(generation, [1, 2, 10, 20])
    const crop = f.picker.endBox(generation)
    f.thumbnails[0].result.resolve(f.thumb('whole'))
    await initial
    expect(f.state).toMatchObject({ busy: true, thumb: null })
    f.thumbnails[1].result.reject(new Error('encode'))
    await crop
    expect(f.state).toMatchObject({ picture: { file: { name: 'a' } }, box: null, thumb: null, busy: false, bad: true })
    const later = f.picker.take(new Blob())
    f.picker.dispose()
    f.preparations[1].resolve(f.picture('late'))
    await later
    expect(f.state).toMatchObject({ picture: { file: { name: 'a' } }, busy: true, bad: false })
  })
})
