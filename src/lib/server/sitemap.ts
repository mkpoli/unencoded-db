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

/** A page and, when known, when its content last changed. */
export type SitemapPage = string | { path: string; updated?: string | null }

// A timestamp in the W3C form sitemaps take, or nothing for one that does not parse.
const lastmod = (updated: string | null | undefined) => {
  const time = updated ? Date.parse(updated) : NaN
  return Number.isNaN(time) ? '' : `<lastmod>${new Date(time).toISOString()}</lastmod>`
}

export function pageSitemap(pages: readonly SitemapPage[]) {
  return sitemapResponse('urlset', LOCALES.flatMap(locale => pages.map(page => {
    const { path, updated } = typeof page === 'string' ? { path: page, updated: null } : page
    return `<url><loc>${SITE_ORIGIN}/${locale}${path}</loc>${lastmod(updated)}</url>`
  })))
}
