import { LOCALES } from '$lib/i18n'
import { SITE_ORIGIN } from '$lib/seo'

// An entry sitemap lists every locale, so cap its size well below 50,000 URLs.
export const ENTRIES_PER_SITEMAP = 5000
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'

export function sitemapResponse(root: 'urlset' | 'sitemapindex', items: string[]) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${NAMESPACE}">\n${items.join('\n')}\n</${root}>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' },
  })
}

export function pageSitemap(paths: readonly string[]) {
  return sitemapResponse('urlset', LOCALES.flatMap(locale => paths.map(path => `<url><loc>${SITE_ORIGIN}/${locale}${path}</loc></url>`)))
}
