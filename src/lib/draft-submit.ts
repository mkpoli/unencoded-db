import type { SubmitFunction } from '@sveltejs/kit'

export function actionErrorKey(status: number | undefined, error: unknown): 'notFound' | 'slow' | 'paused' | 'banned' | 'title' {
  if (status === 404) return 'notFound'
  const message = typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined
  return message === 'slow' || message === 'paused' || message === 'banned' ? message : 'title'
}

export function draftSubmit(options: {
  blocked: () => boolean
  setPending: (pending: boolean) => void
  setError: (key: ReturnType<typeof actionErrorKey> | null) => void
  focusError: () => Promise<void>
}) {
  let active: AbortController | undefined
  let destroyed = false
  const submit: SubmitFunction = ({ cancel, controller }) => {
    if (destroyed || active || options.blocked()) { cancel(); return }
    active = controller
    options.setPending(true)
    options.setError(null)
    return async ({ result, update }) => {
      try {
        if (controller.signal.aborted || destroyed) return
        if (result.type === 'error') {
          options.setError(actionErrorKey(result.status, result.error))
        } else {
          await update()
        }
        if (!destroyed && (result.type === 'error' || result.type === 'failure')) await options.focusError()
      } finally {
        if (active === controller) active = undefined
        if (!destroyed) options.setPending(false)
      }
    }
  }
  return { submit, destroy: () => { destroyed = true; active?.abort() } }
}
