import { isLocale } from '$lib/i18n'
import { MAX_IMAGE_BYTES } from './images'

// Allow room for text fields and form framing.
export const MAX_WRITE_BODY = 128 * 1024

// An 8 MiB image plus the bounded text fields and multipart framing.
export const MAX_NEW_BODY = MAX_IMAGE_BYTES + 64 * 1024

function isNewPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  const [, rawLocale, page] = path.split('/')
  let locale: string | undefined
  try {
    locale = decodeURIComponent(rawLocale ?? '')
  } catch {
    locale = rawLocale
  }
  return isLocale(locale) && page === 'new'
}

export function writeBodyLimit(pathname: string): number {
  return isNewPath(pathname) ? MAX_NEW_BODY : MAX_WRITE_BODY
}

/** Read at most the limit before handing the request to a form parser. */
export async function limitWriteBody(request: Request, limit = MAX_WRITE_BODY): Promise<Request | null> {
  const length = request.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > limit) {
    if (request.body) void request.body.cancel().catch(() => {})
    return null
  }
  if (!request.body) return request

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        void reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const headers = new Headers(request.headers)
  headers.set('content-length', String(size))
  return new Request(request, { headers, body: new Blob(chunks as BlobPart[]) })
}
