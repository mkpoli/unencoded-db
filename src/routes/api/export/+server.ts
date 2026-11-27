import { error } from '@sveltejs/kit'
import { assertDatasetUnchanged, csvHeader, csvRows, datasetCounts, datasetMetadata, datasetRevision, exportBatches, indexChunks, jsonChunks, mediaBatches, mediaCsvHeader, mediaCsvRows } from '$lib/server/export'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

const FORMATS = ['json', 'index', 'csv', 'media'] as const
type Format = (typeof FORMATS)[number]
const INDEX_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> }
const edgeCache = (): EdgeCache | null => (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default ?? null

// One download of the whole public dataset. The JSON file carries its licence and counts; the CSV files
// are rows only, and the data page gives the same licence beside them. `format=index` serves a compact
// edge-cached record + claims catalogue without evidence rows for live external consumers.
export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('format') ?? 'json'
  if (!FORMATS.includes(raw as Format)) error(400, 'Invalid export format')
  const format = raw as Format
  const db = env(event).DB
  const encoder = new TextEncoder()
  // One chunk is produced per pull, so a slow reader stops the next query rather than letting the whole
  // dataset queue in the Worker's memory. Cancelling the response stops the walks as well.
  const stream = (chunks: AsyncGenerator<Uint8Array>) => new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (cause) { controller.error(cause) }
    },
    async cancel() { await chunks.return(undefined) },
  })

  if (format === 'index') {
    const cache = edgeCache()
    const cacheKey = new Request(`${event.url.origin}/api/export?format=index`)
    if (cache) {
      const cached = await cache.match(cacheKey).catch(() => undefined)
      if (cached) return cached
    }
    const generatedAt = new Date().toISOString()
    const response = new Response(stream((async function* () {
      for await (const chunk of indexChunks(db, event.url.origin, generatedAt)) yield encoder.encode(chunk)
    })()), {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': INDEX_CACHE_CONTROL,
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    })
    if (cache) {
      const store = cache.put(cacheKey, response.clone()).catch(() => {})
      if (event.platform?.ctx) event.platform.ctx.waitUntil(store)
      else await store
    }
    return response
  }

  const generatedAt = new Date().toISOString()
  const revision = await datasetRevision(db)
  const headers = new Headers({
    'access-control-allow-origin': '*',
    // A cached download can outlive a hide or a merge. A fresh read is the only one that matches the site.
    'cache-control': 'no-store',
    'content-disposition': `attachment; filename="rare-character-compendium-${generatedAt.slice(0, 10)}.${format === 'media' ? 'media.csv' : format}"`,
    'x-content-type-options': 'nosniff',
  })

  if (format === 'json') {
    headers.set('content-type', 'application/json; charset=utf-8')
    const counts = await datasetCounts(db)
    const metadata = datasetMetadata(event.url.origin, counts, generatedAt, revision)
    return new Response(stream((async function* () {
      for await (const chunk of jsonChunks(db, metadata, revision)) yield encoder.encode(chunk)
    })()), { headers })
  }

  headers.set('content-type', 'text/csv; charset=utf-8')
  if (format === 'csv') {
    return new Response(stream((async function* () {
      yield encoder.encode(csvHeader())
      // A page of the cursor is a page of rows; a record with more evidence than one page repeats its
      // metadata on the next page, as the paged CSV does.
      for await (const batch of exportBatches(db)) yield encoder.encode(csvRows(batch))
      await assertDatasetUnchanged(db, revision)
    })()), { headers })
  }

  return new Response(stream((async function* () {
    yield encoder.encode(mediaCsvHeader())
    for await (const batch of mediaBatches(db)) yield encoder.encode(mediaCsvRows(batch, event.url.origin))
    await assertDatasetUnchanged(db, revision)
  })()), { headers })
}
