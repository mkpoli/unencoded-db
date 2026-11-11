import { expect, test } from 'bun:test'
import type { SubmitFunction } from '@sveltejs/kit'
import { actionErrorKey, draftSubmit } from './draft-submit'

type SubmitArgs = Parameters<SubmitFunction>[0]
type Callback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>
type CallbackArgs = Parameters<Callback>[0]

function setup() {
  let pending = false, blocked = false, error: string | null = null, focused = 0, cancelled = 0, updated = 0
  const pendingAtFocus: boolean[] = []
  const updateOptions: unknown[] = []
  const submission = draftSubmit({
    blocked: () => blocked,
    setPending: value => pending = value,
    setError: value => error = value,
    focusError: async () => { focused++; pendingAtFocus.push(pending) },
  })
  function start(controller = new AbortController()) {
    const callback = submission.submit({ controller, cancel: () => { cancelled++ } } as unknown as SubmitArgs) as Callback | undefined
    return { controller, callback }
  }
  async function finish(callback: Callback, result: CallbackArgs['result']) {
    await callback({ result, update: async (options) => { updated++; updateOptions.push(options) } } as CallbackArgs)
  }
  return { ...submission, start, finish, pendingAtFocus, updateOptions, setBlocked: (value: boolean) => blocked = value, state: () => ({ pending, error, focused, cancelled, updated }) }
}

test('maps action errors like the error page', () => {
  expect(actionErrorKey(404, { message: 'slow' })).toBe('notFound')
  expect(actionErrorKey(429, { message: 'slow' })).toBe('slow')
  expect(actionErrorKey(503, { message: 'paused' })).toBe('paused')
  expect(actionErrorKey(403, { message: 'banned' })).toBe('banned')
  expect(actionErrorKey(500, new Error('unknown'))).toBe('title')
  expect(actionErrorKey(undefined, null)).toBe('title')
})

test('holds the pending lock and focuses inline errors without applying them', async () => {
  const draft = setup()
  draft.setBlocked(true)
  expect(draft.start().callback).toBeUndefined()
  draft.setBlocked(false)
  const { callback } = draft.start()
  expect(draft.start().callback).toBeUndefined()
  expect(draft.state()).toEqual({ pending: true, error: null, focused: 0, cancelled: 2, updated: 0 })
  await draft.finish(callback!, { type: 'error', status: 429, error: { message: 'slow' } })
  expect(draft.state()).toEqual({ pending: false, error: 'slow', focused: 1, cancelled: 2, updated: 0 })
  expect(draft.start().callback).toBeDefined()
  expect(draft.state().error).toBeNull()
})

test('applies failures and redirects using the default update', async () => {
  const draft = setup()
  await draft.finish(draft.start().callback!, { type: 'failure', status: 400, data: { error: 'place' } })
  expect(draft.state()).toEqual({ pending: false, error: null, focused: 1, cancelled: 0, updated: 1 })
  await draft.finish(draft.start().callback!, { type: 'redirect', status: 303, location: '/' })
  expect(draft.state()).toEqual({ pending: false, error: null, focused: 1, cancelled: 0, updated: 2 })
})

test('maps untyped hook errors inline and focuses after clearing pending', async () => {
  for (const message of ['slow', 'paused', 'banned', 'unknown']) {
    const draft = setup()
    const result = { message } as unknown as CallbackArgs['result']
    await draft.finish(draft.start().callback!, result)
    expect(draft.state()).toEqual({ pending: false, error: message === 'unknown' ? 'title' : message, focused: 1, cancelled: 0, updated: 0 })
    expect(draft.pendingAtFocus).toEqual([false])
  }
})

test('keeps form controls intact on non-redirect success', async () => {
  const draft = setup()
  await draft.finish(draft.start().callback!, { type: 'success', status: 200, data: {} })
  expect(draft.updateOptions).toEqual([{ reset: false }])
  expect(draft.state()).toEqual({ pending: false, error: null, focused: 0, cancelled: 0, updated: 1 })
})

test('aborts and ignores a late response after teardown', async () => {
  const draft = setup()
  const { controller, callback } = draft.start()
  draft.destroy()
  expect(controller.signal.aborted).toBe(true)
  await draft.finish(callback!, { type: 'redirect', status: 303, location: '/' })
  expect(draft.state().updated).toBe(0)
  expect(draft.state().focused).toBe(0)
  expect(draft.start().callback).toBeUndefined()
})
