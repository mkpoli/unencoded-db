import { MAX_IMAGE_BYTES } from './images'

// Fits the maximum entry text fields with three-byte UTF-8 text
// percent-encoded, plus form field names and framing.
export const MAX_WRITE_BODY = 512 * 1024

// The largest image plus the text fields and multipart framing.
export const MAX_IMAGE_BODY = MAX_IMAGE_BYTES + MAX_WRITE_BODY

const IMAGE_ROUTES = new Set([
  '/[locale]/new',
  '/[locale]/batch',
  '/[locale]/entry/[id]',
  '/[locale]/entry/[id]/edit',
])

/** The resolved route id decides, so encoded segments cannot miss the image routes. */
export function writeBodyLimit(routeId: string | null | undefined): number {
  return routeId && IMAGE_ROUTES.has(routeId) ? MAX_IMAGE_BODY : MAX_WRITE_BODY
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
