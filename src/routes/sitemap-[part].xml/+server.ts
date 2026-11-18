import { error } from '@sveltejs/kit'
import { PUBLIC_SECTIONS } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, pageSitemap } from '$lib/server/sitemap'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { part } = event.params
  if (part === 'site') return pageSitemap(PUBLIC_SECTIONS)
  const end = Number(part) * ENTRIES_PER_SITEMAP
  if (!/^[1-9]\d*$/.test(part) || !Number.isSafeInteger(end)) error(404)

  const { results } = await env(event).DB.prepare(`
    SELECT id FROM entries WHERE id > ? AND id <= ?
      AND hidden_at IS NULL AND merged_into IS NULL
    ORDER BY id
  `).bind(end - ENTRIES_PER_SITEMAP, end).all<{ id: number }>()
  if (!results.length) error(404)
  return pageSitemap(results.map(({ id }) => `/entry/${id}`))
}
