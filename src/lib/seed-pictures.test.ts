import { expect, test } from 'bun:test'
import { loadSeedPictures } from './seed-pictures'

test('holds busy across downloads and continues past individual failures', async () => {
  const states: boolean[] = []
  const added: string[] = []
  let releaseFirst!: () => void
  const firstPending = new Promise<void>(resolve => { releaseFirst = resolve })

  const fetcher = (async (url: string) => {
    if (url.endsWith('/a.png')) {
      await firstPending
      return { ok: true, blob: async () => new Blob(['a']) }
    }
    if (url.endsWith('/bad.png')) return { ok: true, blob: async () => { throw new Error('corrupt') } }
    if (url.endsWith('/missing.png')) return { ok: false, blob: async () => new Blob([]) }
    return { ok: true, blob: async () => new Blob(['c']) }
  }) as unknown as typeof fetch

  loadSeedPictures(['/media/a.png', '/media/bad.png', '/media/missing.png', '/media/c.png'], async blob => { added.push(await blob.text()) }, busy => states.push(busy), fetcher)
  expect(states).toEqual([true])
  releaseFirst()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(added).toEqual(['a', 'c'])
  expect(states).toEqual([true, false])
})

test('aborts cleanly without adding pictures after cancel', async () => {
  const states: boolean[] = []
  const added: Blob[] = []
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const fetcher = (async () => {
    await pending
    return { ok: true, blob: async () => new Blob(['x']) }
  }) as unknown as typeof fetch

  const stop = loadSeedPictures(['a.png'], async blob => { added.push(blob) }, busy => states.push(busy), fetcher)
  expect(states).toEqual([true])
  stop()
  release()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(added).toEqual([])
  expect(states).toEqual([true])
})
