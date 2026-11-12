import { MAX_IMAGE, MAX_THUMB } from './image'

// Allow both uploads at their individual limits plus room for fields and multipart framing.
export const MAX_WRITE_BODY = MAX_IMAGE + MAX_THUMB + 1024 * 1024

// A batch carries up to BATCH_ROWS_MAX pictures, and a new record the pictures of up to ADD_SIGHTINGS_MAX
// sightings, each prepared in the browser. The request is held in memory, so the whole body stays under this
// ceiling; each picture still has its own limit.
export const MAX_PICTURES_BODY = 32 * 1024 * 1024

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
