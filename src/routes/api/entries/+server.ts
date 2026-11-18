import { error, json } from '@sveltejs/kit'
import { EXPORT_PAGE_MAX, exportPage } from '$lib/server/entries'
import { csvHeader, csvRows, exportedEntry } from '$lib/server/export'
import { env } from '$lib/server/guard'
import { positiveId } from '../../_submission.server'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async (event) => {
  const params = event.url.searchParams
  const rawAfter = params.get('after')
  const after = rawAfter === null ? 0 : positiveId(rawAfter)
  const rawSighting = params.get('sighting')
  const sighting = rawSighting === null ? null : positiveId(rawSighting)
  const rawLimit = params.get('limit')
  const limit = rawLimit === null ? 100 : positiveId(rawLimit)
  const format = params.get('format') ?? 'json'
  if (after === null || (rawSighting !== null && (sighting === null || after === 0)) || limit === null || limit > EXPORT_PAGE_MAX || !['json', 'csv'].includes(format)) error(400, 'Invalid export parameters')
  const result = await exportPage(env(event).DB, after, limit, sighting)
  const headers = new Headers({ 'access-control-allow-origin': '*' })
  if (result.next !== null) {
    const next = new URL(event.url)
    next.searchParams.set('after', String(result.next))
    if (result.next_sighting === null) next.searchParams.delete('sighting')
    else next.searchParams.set('sighting', String(result.next_sighting))
    headers.set('Link', `<${next.href}>; rel="next"`)
  }
  if (format === 'json') return json({ ...result, entries: result.entries.map(exportedEntry) }, { headers })
  headers.set('Content-Type', 'text/csv; charset=utf-8')
  return new Response(csvHeader(false) + csvRows(result.entries, false), { headers })
}
