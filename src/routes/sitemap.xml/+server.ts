import { SITE_ORIGIN } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, sitemapResponse } from '$lib/server/sitemap'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const { results } = await env(event).DB.prepare(`
    SELECT DISTINCT (id - 1) / ${ENTRIES_PER_SITEMAP} AS part
    FROM entries WHERE hidden_at IS NULL AND merged_into IS NULL
    ORDER BY part
  `).all<{ part: number }>()
  const parts = ['site', ...results.map(({ part }) => String(part + 1))]
  return sitemapResponse('sitemapindex', parts.map(part => `<sitemap><loc>${SITE_ORIGIN}/sitemap-${part}.xml</loc></sitemap>`))
}
