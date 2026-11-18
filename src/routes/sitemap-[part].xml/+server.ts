import { error } from '@sveltejs/kit'
import { PUBLIC_SECTIONS } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, pageSitemap } from '$lib/server/sitemap'
import { media } from '$lib/media'
import type { RequestHandler } from './$types'

// `site` lists the sections, a number a block of records, and `sources-` and a number a block of the
// sources that visible records cite.
export const GET: RequestHandler = async event => {
  const { part } = event.params
  if (part === 'site') return pageSitemap(PUBLIC_SECTIONS)
  const match = /^(sources-)?([1-9]\d*)$/.exec(part)
  const end = Number(match?.[2]) * ENTRIES_PER_SITEMAP
  if (!match || !Number.isSafeInteger(end)) error(404)

  const sources = Boolean(match[1])
  const { results } = await env(event).DB.prepare(sources
    ? 'SELECT id FROM sources WHERE id > ? AND id <= ? AND records > 0 ORDER BY id'
    : 'SELECT id, updated_at FROM entries WHERE id > ? AND id <= ? AND hidden_at IS NULL AND merged_into IS NULL ORDER BY id',
  ).bind(end - ENTRIES_PER_SITEMAP, end).all<{ id: number; updated_at?: string }>()
  if (!results.length) error(404)
  if (sources) return pageSitemap(results.map(({ id }) => `/source/${id}`))

  // The pictures of each record's visible sightings, read through the index the export uses. A source
  // keeps no time of change, so only records carry one.
  const { results: pictures } = await env(event).DB.prepare(`
    SELECT s.entry_id, x.image_key FROM sightings s INDEXED BY sightings_visible_export
    CROSS JOIN sighting_media x ON x.sighting_id = s.id
    WHERE s.entry_id > ? AND s.entry_id <= ? AND s.hidden_at IS NULL
    ORDER BY s.entry_id, s.id, x.position
  `).bind(end - ENTRIES_PER_SITEMAP, end).all<{ entry_id: number; image_key: string }>()
  const images = Map.groupBy(pictures, picture => picture.entry_id)
  return pageSitemap(results.map(({ id, updated_at }) => ({
    path: `/entry/${id}`, updated: updated_at, images: (images.get(id) ?? []).map(picture => media(picture.image_key)),
  })))
}
