import { afterEach, expect, mock, test } from 'bun:test'
import { lookupIdsHints } from './ids-hints'

const originalFetch = globalThis.fetch
const turn = () => new Promise<void>(resolve => setImmediate(resolve))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

afterEach(() => { globalThis.fetch = originalFetch })

test('duplicate records arrive while the encoded lookup is still pending', async () => {
  const encoded = deferred<string | null>()
  const setEncoded = mock()
  const setSame = mock()
  const request = mock(() => Promise.resolve(Response.json([{ id: 42 }, { id: 'bad' }, null])))
  globalThis.fetch = request as unknown as typeof fetch

  lookupIdsHints('⿰女子', () => encoded.promise, setEncoded, setSame)
  await turn()
  expect(request).toHaveBeenCalledWith(`/api/match?ids=${encodeURIComponent('⿰女子')}`, { signal: expect.any(AbortSignal) })
  expect(setSame).toHaveBeenCalledWith([{ id: 42 }])
  expect(setEncoded).not.toHaveBeenCalled()
  encoded.resolve('字')
  await turn()
  expect(setEncoded).toHaveBeenCalledWith('字')
})

test('new hints survive older results arriving after cancellation', async () => {
  const encoded = deferred<string | null>()
  const records = deferred<Response>()
  const setEncoded = mock()
  const setSame = mock()
  const request = mock()
    .mockReturnValueOnce(records.promise)
    .mockResolvedValueOnce(Response.json([{ id: 7 }]))
  globalThis.fetch = request as unknown as typeof fetch

  const cancel = lookupIdsHints('⿰女子', () => encoded.promise, setEncoded, setSame)
  const signal = (request.mock.calls[0][1] as RequestInit).signal!
  expect(signal.aborted).toBe(false)
  cancel()
  expect(signal.aborted).toBe(true)
  lookupIdsHints('⿱日月', async () => '明', setEncoded, setSame)
  await turn()
  encoded.resolve('字')
  records.resolve(Response.json([{ id: 42 }]))
  await turn()
  expect(setEncoded.mock.calls).toEqual([['明']])
  expect(setSame.mock.calls).toEqual([[[{ id: 7 }]]])
})

test('cancellation handles an aborted duplicate request without updating hints', async () => {
  const setEncoded = mock()
  const setSame = mock()
  globalThis.fetch = ((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })) as typeof fetch

  const cancel = lookupIdsHints('⿰女子', async () => null, setEncoded, setSame)
  cancel()
  await turn()
  expect(setEncoded).not.toHaveBeenCalled()
  expect(setSame).not.toHaveBeenCalled()
})

test('each lookup can succeed when the other fails', async () => {
  const setEncoded = mock()
  const setSame = mock()
  const request = mock()
    .mockResolvedValueOnce(Response.json([{ id: 42 }]))
    .mockRejectedValueOnce(new Error('offline'))
  globalThis.fetch = request as unknown as typeof fetch

  lookupIdsHints('⿰女子', async () => { throw new Error('offline') }, setEncoded, setSame)
  lookupIdsHints('⿱日月', async () => '明', setEncoded, setSame)
  await turn()
  expect(setEncoded.mock.calls).toContainEqual([null])
  expect(setEncoded.mock.calls).toContainEqual(['明'])
  expect(setSame.mock.calls).toContainEqual([[{ id: 42 }]])
  expect(setSame.mock.calls).toContainEqual([[]])
})

test('ignores failed and malformed duplicate responses', async () => {
  const setSame = mock()
  const request = mock()
    .mockResolvedValueOnce(new Response('[{"id":42}]', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ id: 42 }))
    .mockRejectedValueOnce(new Error('offline'))
  globalThis.fetch = request as unknown as typeof fetch
  for (let i = 0; i < 3; i++) {
    lookupIdsHints('⿰女子', async () => null, () => {}, setSame)
    await turn()
  }
  expect(setSame.mock.calls).toEqual([[[]], [[]]])
})
