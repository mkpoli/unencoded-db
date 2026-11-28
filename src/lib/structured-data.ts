import { recordCode } from './code'
import { SITE_ORIGIN } from './seo'

export const RECORD_LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/'
const CONTEXT = 'https://schema.org'
const SITE = { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/`, url: `${SITE_ORIGIN}/` }
const PUBLISHER = { '@type': 'Organization', name: 'Glyph Atlas', url: 'https://glyphatlas.org/' }

export type WebsiteFacts = { locale: string; name: string; alternateName: string; description: string }

export function websiteData({ locale, name, alternateName, description }: WebsiteFacts): Json {
  return {
    '@context': CONTEXT, '@type': 'WebSite', '@id': `${SITE_ORIGIN}/`, url: `${SITE_ORIGIN}/`,
    name, alternateName, description, inLanguage: locale, publisher: PUBLISHER,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_ORIGIN}/${locale}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

export type SourceFacts = { id: number; title?: string | null; author?: string | null; publisher?: string | null; report_date?: string | null; url?: string | null; container?: string | null }
type Json = Record<string, unknown>

// A date in ISO form (YYYY, YYYY-MM or YYYY-MM-DD). Era names and other transcriptions are not dates here.
export function machineDate(text: string | null | undefined): string | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text?.trim() ?? '')
  if (!match) return null
  const [, year, month, day] = match
  if (month && (+month < 1 || +month > 12)) return null
  if (day && (+day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate())) return null
  return match[0]
}

const present = (fields: Json): Json => Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ''))
const web = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null)
// What the source appeared in: a journal issue, a chat group, a site.
const containerOf = (source: SourceFacts): Json | null => (source.container ? { '@type': 'CreativeWork', name: source.container } : null)
const sourceUrl = (locale: string, id: number) => `${SITE_ORIGIN}/${locale}/source/${id}`

function breadcrumbs(trail: { name: string; url: string }[]): Json {
  return {
    '@context': CONTEXT, '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
  }
}

// The web addresses among a source's archived copies, or null when there are none.
const archivedAt = (archives: readonly string[] = []) => {
  const copies = archives.map(web).filter(url => url !== null)
  return copies.length ? copies : null
}

function citation(locale: string, source: SourceFacts, archives?: readonly string[]): Json {
  return present({
    '@type': 'CreativeWork', name: source.title, creator: source.author, publisher: source.publisher,
    datePublished: machineDate(source.report_date), isPartOf: containerOf(source), url: sourceUrl(locale, source.id), archivedAt: archivedAt(archives),
  })
}

export type RecordFacts = {
  locale: string; id: number; name: string; description: string; siteName: string
  image?: string | null  // a path or URL of the cover picture
  sources: SourceFacts[]  // the works cited
  vias?: SourceFacts[]  // what the evidence was found through
  archives?: ReadonlyMap<number, readonly string[]>  // copies web archives keep of the sources, by source
}

// schema.org has no property for a go-between: `isBasedOn` says the record is derived from a work, which
// a record is not, so the vias are cited like the works.
// The record is a CreativeWork: it holds evidence and claims, not a definition of a term. The licence covers
// the record text only; the pictures keep the rights of the works they come from.
export function recordData(facts: RecordFacts): Json[] {
  const url = `${SITE_ORIGIN}/${facts.locale}/${recordCode(facts.id)}`
  const seen = new Set<number>()
  const sources = [...facts.sources, ...facts.vias ?? []].filter(source => !seen.has(source.id) && seen.add(source.id))
  return [
    present({
      '@context': CONTEXT, '@type': 'CreativeWork', '@id': url, url, name: facts.name, description: facts.description,
      // The picture is its own object with no licence of its own here: the record's licence does not reach it.
      image: facts.image ? { '@type': 'ImageObject', contentUrl: new URL(facts.image, SITE_ORIGIN).href } : null, inLanguage: facts.locale, license: RECORD_LICENSE,
      isPartOf: SITE,
      citation: sources.length ? sources.map(source => citation(facts.locale, source, facts.archives?.get(source.id))) : null,
    }),
    breadcrumbs([{ name: facts.siteName, url: `${SITE_ORIGIN}/${facts.locale}` }, { name: facts.name, url }]),
  ]
}

// `archives` are copies of the source kept by web archives, given as `archivedAt`.
export type SourcePageFacts = { locale: string; source: SourceFacts; archives?: string[]; name: string; siteName: string; sourcesName: string }

export function sourceData({ locale, source, archives = [], name, siteName, sourcesName }: SourcePageFacts): Json[] {
  const url = sourceUrl(locale, source.id), container = containerOf(source)
  return [
    present({
      '@context': CONTEXT, '@type': 'CreativeWork', '@id': url, url, name, creator: source.author, publisher: source.publisher,
      datePublished: machineDate(source.report_date), sameAs: web(source.url), archivedAt: archivedAt(archives), inLanguage: locale,
      isPartOf: container ? [SITE, container] : SITE,
    }),
    breadcrumbs([{ name: siteName, url: `${SITE_ORIGIN}/${locale}` }, { name: sourcesName, url: `${SITE_ORIGIN}/${locale}/sources` }, { name, url }]),
  ]
}

export type DatasetFacts = {
  locale: string; name: string; alternateName: string; description: string; license: string; publisher: string; version: number
  downloads: { name: string; format: 'json' | 'csv' | 'media' }[]
}

const ENCODINGS = { json: 'application/json', csv: 'text/csv', media: 'text/csv' } as const

// The open data page as a Dataset, so dataset search engines list it with its downloads. One `@id` serves
// all six locales of the page.
export function datasetData(facts: DatasetFacts): Json[] {
  const url = `${SITE_ORIGIN}/${facts.locale}/data`
  return [{
    '@context': CONTEXT, '@type': 'Dataset', '@id': `${SITE_ORIGIN}/data#dataset`, url,
    name: facts.name, alternateName: facts.alternateName, description: facts.description,
    license: facts.license, isAccessibleForFree: true, version: String(facts.version),
    publisher: { '@type': 'Organization', name: facts.publisher },
    isPartOf: SITE,
    distribution: facts.downloads.map(download => ({
      '@type': 'DataDownload', name: download.name, encodingFormat: ENCODINGS[download.format],
      contentUrl: `${SITE_ORIGIN}/api/export?format=${download.format}`,
    })),
  }]
}

export type PartPageFacts = { locale: string; part: string; name: string; description: string; siteName: string; partsName: string }

export function partData({ locale, part, name, description, siteName, partsName }: PartPageFacts): Json[] {
  const url = `${SITE_ORIGIN}/${locale}/part/${encodeURIComponent(part)}`
  return [
    present({ '@context': CONTEXT, '@type': 'CollectionPage', '@id': url, url, name, description, inLanguage: locale, isPartOf: SITE }),
    breadcrumbs([
      { name: siteName, url: `${SITE_ORIGIN}/${locale}` },
      { name: partsName, url: `${SITE_ORIGIN}/${locale}/radicals` },
      { name, url },
    ]),
  ]
}

export type CopyPageFacts = { locale: string; slug: string; name: string; description: string; siteName: string; sourcesName: string }

export function copyData({ locale, slug, name, description, siteName, sourcesName }: CopyPageFacts): Json[] {
  const url = `${SITE_ORIGIN}/${locale}/sources/copy/${slug}`
  return [
    present({ '@context': CONTEXT, '@type': 'CollectionPage', '@id': url, url, name, description, inLanguage: locale, isPartOf: SITE }),
    breadcrumbs([
      { name: siteName, url: `${SITE_ORIGIN}/${locale}` },
      { name: sourcesName, url: `${SITE_ORIGIN}/${locale}/sources` },
      { name, url },
    ]),
  ]
}

// The text of one script element; `<` is escaped so a value cannot close the element.
export const jsonLdScript = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
