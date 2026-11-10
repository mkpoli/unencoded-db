import { error, json } from '@sveltejs/kit'
import { ENTRY_FIELDS, SIGHTING_FIELDS, EXPORT_PAGE_MAX, exportPage } from '$lib/server/entries'
import { parseRelatedCharacters } from '$lib/related'
import { parseSightingTypes } from '$lib/scripts'
import { env } from '$lib/server/guard'
import { positiveId } from '../../_submission.server'
import type { RequestHandler } from './$types'

const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value)
  // Spreadsheet applications may interpret cells beginning with these characters as formulas.
  if (/^[\s]*[=+\-@]/u.test(text)) text = "'" + text
  return `"${text.replace(/"/g, '""')}"`
}

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
  const headers = new Headers()
  if (result.next !== null) {
    const next = new URL(event.url)
    next.searchParams.set('after', String(result.next))
    if (result.next_sighting === null) next.searchParams.delete('sighting')
    else next.searchParams.set('sighting', String(result.next_sighting))
    headers.set('Link', `<${next.href}>; rel="next"`)
  }
  if (format === 'json') return json({
    ...result,
    entries: result.entries.map(entry => ({
      ...entry,
      related_characters: parseRelatedCharacters(entry.related_characters),
      evidence: entry.evidence.map(sighting => ({ ...sighting, types: parseSightingTypes(sighting.types) })),
    })),
  }, { headers })
  const columns = ['entry_id', ...ENTRY_FIELDS, 'sighting_id', ...SIGHTING_FIELDS] as const
  const rows = result.entries.flatMap(({ evidence, ...entry }) => {
    const sightings = evidence.length ? evidence : [null]
    return sightings.map(sighting => [entry.id, ...ENTRY_FIELDS.map(field => entry[field]), sighting?.id, ...SIGHTING_FIELDS.map(field => field === 'types' ? parseSightingTypes(sighting?.types).join(', ') : sighting?.[field])])
  })
  headers.set('Content-Type', 'text/csv; charset=utf-8')
  return new Response([columns.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n') + '\r\n', { headers })
}
