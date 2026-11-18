import { SITE_ORIGIN } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, sitemapResponse } from '$lib/server/sitemap'
import type { RequestHandler } from './$types'

// One shard per block of record ids and per block of source ids that holds anything public.
export const GET: RequestHandler = async event => {
  const { results } = await env(event).DB.prepare(`
    SELECT 'entries' AS kind, part FROM (SELECT DISTINCT (id - 1) / ${ENTRIES_PER_SITEMAP} AS part FROM entries WHERE hidden_at IS NULL AND merged_into IS NULL)
    UNION ALL
    SELECT 'sources', part FROM (SELECT DISTINCT (id - 1) / ${ENTRIES_PER_SITEMAP} AS part FROM sources WHERE records > 0)
    ORDER BY kind, part
  `).all<{ kind: 'entries' | 'sources'; part: number }>()
  const parts = ['site', ...results.map(({ kind, part }) => kind === 'entries' ? String(part + 1) : `sources-${part + 1}`)]
  return sitemapResponse('sitemapindex', parts.map(part => `<sitemap><loc>${SITE_ORIGIN}/sitemap-${part}.xml</loc></sitemap>`))
}
