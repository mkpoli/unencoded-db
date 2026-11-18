import { error } from '@sveltejs/kit'
import { PUBLIC_SECTIONS } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, pageSitemap } from '$lib/server/sitemap'
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
    : 'SELECT id FROM entries WHERE id > ? AND id <= ? AND hidden_at IS NULL AND merged_into IS NULL ORDER BY id',
  ).bind(end - ENTRIES_PER_SITEMAP, end).all<{ id: number }>()
  if (!results.length) error(404)
  return pageSitemap(results.map(({ id }) => sources ? `/source/${id}` : `/entry/${id}`))
}
