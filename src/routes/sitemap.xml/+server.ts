import { SITE_ORIGIN } from '$lib/seo'
import { env } from '$lib/server/guard'
import { ENTRIES_PER_SITEMAP, sitemapResponse } from '$lib/server/sitemap'
import type { RequestHandler } from './$types'

// One shard per block of record ids and per block of source ids that holds anything public,
// plus shards for public digitized copies and tagged component pages when present.
export const GET: RequestHandler = async event => {
  const { results } = await env(event).DB.prepare(`
    SELECT 'entries' AS kind, part FROM (SELECT DISTINCT (id - 1) / ${ENTRIES_PER_SITEMAP} AS part FROM entries WHERE hidden_at IS NULL AND merged_into IS NULL)
    UNION ALL
    SELECT 'sources', part FROM (SELECT DISTINCT (id - 1) / ${ENTRIES_PER_SITEMAP} AS part FROM sources WHERE records > 0)
    UNION ALL
    SELECT 'copies', 0 WHERE EXISTS (
      SELECT 1 FROM digitized_copy_pages p JOIN sources s ON s.id = p.source_id WHERE s.records > 0 LIMIT 1
    )
    UNION ALL
    SELECT 'parts', 0 WHERE EXISTS (SELECT 1 FROM part_counts LIMIT 1)
    ORDER BY kind, part
  `).all<{ kind: 'entries' | 'sources' | 'copies' | 'parts'; part: number }>()
  const parts = [
    'site',
    ...results.map(({ kind, part }) =>
      kind === 'entries' ? String(part + 1)
      : kind === 'sources' ? `sources-${part + 1}`
      : kind,
    ),
  ]
  return sitemapResponse('sitemapindex', parts.map(part => `<sitemap><loc>${SITE_ORIGIN}/sitemap-${part}.xml</loc></sitemap>`))
}
