import { error } from '@sveltejs/kit'
import { assertDatasetUnchanged, csvHeader, csvRows, datasetCounts, datasetMetadata, datasetRevision, exportBatches, jsonChunks, mediaBatches, mediaCsvHeader, mediaCsvRows } from '$lib/server/export'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

const FORMATS = ['json', 'csv', 'media'] as const
type Format = (typeof FORMATS)[number]

// One download of the whole public dataset. The JSON file carries its licence and counts; the CSV files
// are rows only, and the data page gives the same licence beside them.
export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('format') ?? 'json'
  if (!FORMATS.includes(raw as Format)) error(400, 'Invalid export format')
  const format = raw as Format
  const db = env(event).DB
  const generatedAt = new Date().toISOString()
  const revision = await datasetRevision(db)
  const headers = new Headers({
    'access-control-allow-origin': '*',
    // A cached download can outlive a hide or a merge. A fresh read is the only one that matches the site.
    'cache-control': 'no-store',
    'content-disposition': `attachment; filename="rare-character-compendium-${generatedAt.slice(0, 10)}.${format === 'media' ? 'media.csv' : format}"`,
    'x-content-type-options': 'nosniff',
  })
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
