import { LOCALES } from '$lib/i18n'
import { SITE_ORIGIN } from '$lib/seo'

// An entry sitemap lists every locale, so cap its size well below 50,000 URLs.
export const ENTRIES_PER_SITEMAP = 5000
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'
const IMAGE_NAMESPACE = 'http://www.google.com/schemas/sitemap-image/1.1'
// Google reads at most this many pictures for one page.
export const IMAGES_PER_PAGE = 1000

export function sitemapResponse(root: 'urlset' | 'sitemapindex', items: string[]) {
  const namespaces = root === 'urlset' ? ` xmlns="${NAMESPACE}" xmlns:image="${IMAGE_NAMESPACE}" xmlns:xhtml="${XHTML_NAMESPACE}"` : ` xmlns="${NAMESPACE}"`
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<${root}${namespaces}>\n${items.join('\n')}\n</${root}>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' },
  })
}

/** A page, when known when its content last changed, and the paths of the pictures it shows. */
export type SitemapPage = string | { path: string; updated?: string | null; images?: readonly string[] }

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// A timestamp in the W3C form sitemaps take, or nothing for one that does not parse.
const lastmod = (updated: string | null | undefined) => {
  const time = updated ? Date.parse(updated) : NaN
  return Number.isNaN(time) ? '' : `<lastmod>${new Date(time).toISOString()}</lastmod>`
}

// The page in every language and the English one as the default, the set its own head names.
const alternates = (path: string) => [
  ...LOCALES.map(locale => `<xhtml:link rel="alternate" hreflang="${locale}" href="${SITE_ORIGIN}/${locale}${path}"/>`),
  `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}${path ? `/en${path}` : '/'}"/>`,
].join('')

export function pageSitemap(pages: readonly SitemapPage[]) {
  return sitemapResponse('urlset', LOCALES.flatMap(locale => pages.map(page => {
    const { path, updated, images = [] } = typeof page === 'string' ? { path: page } : page
    const pictures = images.slice(0, IMAGES_PER_PAGE).map(image => `<image:image><image:loc>${escapeXml(SITE_ORIGIN + image)}</image:loc></image:image>`).join('')
    return `<url><loc>${SITE_ORIGIN}/${locale}${path}</loc>${lastmod(updated)}${alternates(path)}${pictures}</url>`
  })))
}
