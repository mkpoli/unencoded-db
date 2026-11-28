// Parser and sighting mapper for IRG Working Set Online Review Tool (ORT) pages on hc.jsecs.org.
// Extracts bibliographic evidence citations and IRG discussion notes from WS2015, WS2017, WS2021 and
// WS2024 pages without downloading or mirroring evidence scans (which remain under their source rights).
import { SIGHTING_TYPES, storeChosen, VIAS_MAX } from './scripts'
import { cleanSourceUrl } from './source-url'
import type { SightingFields, Via } from './server/entries'

export type OrtWorkingSet = 'ws2015' | 'ws2017' | 'ws2021' | 'ws2024'

export type OrtEvidenceSource = {
  sourceRef: string
  region: string | null
  title: string | null
  reportDate: string | null
  page: string | null
  citation: string
  directUrl: string | null
  evidenceUrls: string[]
  notes: string[]
}

export type OrtDiscussion = {
  meeting: string | null
  text: string
}

export type OrtRecord = {
  ws: OrtWorkingSet
  serial: string | null
  pageUrl: string
  sources: OrtEvidenceSource[]
  discussions: OrtDiscussion[]
}

const WS_LABELS: Record<OrtWorkingSet, string> = {
  ws2015: 'IRG Working Set 2015',
  ws2017: 'IRG Working Set 2017',
  ws2021: 'IRG Working Set 2021',
  ws2024: 'IRG Working Set 2024',
}

const WS_SHORT: Record<OrtWorkingSet, string> = {
  ws2015: 'IRG WS2015',
  ws2017: 'IRG WS2017',
  ws2021: 'IRG WS2021',
  ws2024: 'IRG WS2024',
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = parseInt(body.slice(2), 16)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : whole
    }
    if (body.startsWith('#')) {
      const cp = parseInt(body.slice(1), 10)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : whole
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim()
}

function cleanText(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, max) : null
}

function firstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"')\]]+/i.exec(text)
  if (!match) return null
  const cleaned = cleanSourceUrl(match[0].replace(/[.,;]+$/, ''))
  return cleaned && /^https?:\/\//i.test(cleaned) ? cleaned : null
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/gu, ' ').trim()
}

function extractYear(text: string): string | null {
  const paren = /\((1\d{3}|20\d{2})\)/.exec(text)
  return paren ? paren[1] : null
}

/**
 * Splits a freeform ORT bibliographic citation into `{ title, reportDate, page }` when structured
 * delimiters (CJK book-title brackets `《…》`, `, vol.`, `page`, `p.`) are present.
 */
export function parseCitationText(raw: string): { title: string | null; reportDate: string | null; page: string | null } {
  const text = stripUrls(raw).replace(/^\{[^}]+\}\s*/, '').trim()
  if (!text) return { title: null, reportDate: null, page: null }
  const reportDate = extractYear(text)

  const book = /《([^》]+)》/.exec(text)
  if (book) {
    const title = cleanText(`《${book[1]}》`, 300)
    const after = text.slice(book.index + book[0].length).replace(/^\s*\(\d{4}\)\s*/, '').replace(/^[,，;；:：\s]+/, '').trim()
    return { title, reportDate, page: cleanText(after, 120) }
  }

  const locator = /\b(vol\.?\s*\d[\w.,\s/-]*|p{1,2}\.?\s*\d[\w.,\s/-]*|page\s*\d[\w.,\s/-]*|fol\.?\s*\d[\w.,\s/-]*)/i.exec(text)
  if (locator && locator.index > 0) {
    const title = cleanText(text.slice(0, locator.index).replace(/[,，;；:：\s]+$/, ''), 300)
    const page = cleanText(text.slice(locator.index), 120)
    return { title, reportDate, page }
  }

  return { title: cleanText(text, 300), reportDate, page: null }
}

function resolveOrtDataUrl(ws: OrtWorkingSet, rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return cleanSourceUrl(trimmed)
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  if (normalized.includes('..')) return null
  return `https://hc.jsecs.org/irg/${ws}/data${encodeURI(normalized)}`
}

function extractSerial(html: string): string | null {
  const dataId = /data-id="(\d{1,5})"/i.exec(html)
  if (dataId && Number(dataId[1]) >= 1) return dataId[1].padStart(5, '0')
  const title = /<title>\s*(\d{5})\s*\|/i.exec(html)
  if (title && Number(title[1]) >= 1) return title[1]
  const tableSeq = /<td>0\s*-\s*Seq(?:uence)?\.?\s*No\.?(?:umber)?<\/td>\s*<td>\s*(\d{1,5})\s*<\/td>/i.exec(html)
  if (tableSeq && Number(tableSeq[1]) >= 1) return tableSeq[1].padStart(5, '0')
  return null
}

function extractDiscussions(html: string): OrtDiscussion[] {
  const out: OrtDiscussion[] = []
  const table = /<table\s+class=["']?dicussion_record["']?[^>]*>([\s\S]*?)<\/table>/i.exec(html)
  if (table) {
    const rowRe = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi
    let match: RegExpExecArray | null
    while ((match = rowRe.exec(table[1])) !== null) {
      const left = stripTags(match[1])
      const text = stripTags(match[2])
      if (!text) continue
      const meeting = /IRG\s*#\d+/i.exec(left)?.[0] ?? null
      out.push({ meeting, text: text.slice(0, 400) })
      if (out.length >= 10) break
    }
  }
  if (!out.length) {
    const legacy = /<td>1\s*-\s*Diss?cussion\s+Record<\/td>\s*<td>([\s\S]*?)<\/td>/i.exec(html)
    const text = legacy ? stripTags(legacy[1]) : ''
    if (text) out.push({ meeting: null, text: text.slice(0, 400) })
  }
  return out
}

function dataField(data: Record<string, unknown>, pattern: RegExp): string | null {
  for (const [key, value] of Object.entries(data)) {
    if (!pattern.test(key)) continue
    const text = cleanText(value, 500)
    if (text && !/^(=|N\/A$|No$)/i.test(text)) return text
  }
  return null
}

function parseModernEvidences(ws: OrtWorkingSet, rawAttr: string): OrtEvidenceSource[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeHtmlEntities(rawAttr))
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

  const sources: OrtEvidenceSource[] = []
  for (const [key, rawEntry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
    const entry = rawEntry as Record<string, unknown>
    const info = entry.info && typeof entry.info === 'object' && !Array.isArray(entry.info)
      ? entry.info as Record<string, unknown>
      : entry
    const data = info.data && typeof info.data === 'object' && !Array.isArray(info.data)
      ? info.data as Record<string, unknown>
      : {}
    const sourceRef = cleanText(info.source_reference ?? entry.source_identifier ?? key, 80) ?? key
    const region = cleanText(info.region ?? entry.region, 20)

    const evidenceList = Array.isArray(entry.evidence) ? entry.evidence : []
    const evidenceUrls: string[] = []
    const evidenceDescriptions: string[] = []
    let directUrl: string | null = null
    for (const item of evidenceList) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const url = resolveOrtDataUrl(ws, row.path)
      if (url && !evidenceUrls.includes(url)) evidenceUrls.push(url)
      const desc = cleanText(row.description, 500)
      if (desc) {
        if (!directUrl) directUrl = firstUrl(desc)
        evidenceDescriptions.push(stripUrls(desc))
      }
    }

    const titleAndYear = dataField(data, /title\s+and\s+year/i)
    const explicitPage = dataField(data, /page\s+no\./i)
    const refDoc = dataField(data, /ref\.\s*to\s+evidence|references?\s+for\s+evidence|evidence$/i)
    const reading = dataField(data, /\breading\b/i)
    const note = dataField(data, /\bnotes?\b/i)
    const group = dataField(data, /^group$/i)

    // Choose the richest bibliographic description available (explicit title+year, evidence item
    // description, or `Ref. to Evidence doc`, avoiding bare numeric document codes like "064" or
    // bare image filenames like "SAT-05947-01.jpg").
    const meaningfulRef = refDoc && !/^\d{1,4}$/.test(refDoc) && !/\.(?:jpe?g|png|pdf|bmp|webp)(?:;|$)/i.test(refDoc)
      ? refDoc
      : null
    const rawCitation = [
      titleAndYear,
      explicitPage,
      !titleAndYear ? (evidenceDescriptions[0] || meaningfulRef) : null,
    ].filter((part): part is string => Boolean(part)).join(', ')

    const citation = cleanText(rawCitation, 500) ?? `${WS_SHORT[ws]} ${sourceRef}`
    if (!directUrl) directUrl = firstUrl(rawCitation)

    let title: string | null = null
    let reportDate: string | null = null
    let page: string | null = null
    if (titleAndYear) {
      const parsedTitle = parseCitationText(titleAndYear)
      title = parsedTitle.title
      reportDate = parsedTitle.reportDate
      page = explicitPage ?? parsedTitle.page
    } else if (evidenceDescriptions[0] || meaningfulRef) {
      const parsedCit = parseCitationText(evidenceDescriptions[0] || meaningfulRef!)
      title = parsedCit.title
      reportDate = parsedCit.reportDate
      page = explicitPage ?? parsedCit.page
    }

    const notes: string[] = []
    if (group && group !== region) notes.push(`Source group: ${group}`)
    if (evidenceDescriptions.length > 1) {
      for (const extra of evidenceDescriptions.slice(1, 4)) notes.push(`Additional evidence: ${extra}`)
    }
    if (reading) notes.push(reading)
    if (note) notes.push(`Note: ${note}`)

    sources.push({
      sourceRef,
      region,
      title,
      reportDate,
      page,
      citation,
      directUrl,
      evidenceUrls: evidenceUrls.slice(0, 5),
      notes,
    })
  }
  return sources
}

function parseWs2015Table(html: string): OrtEvidenceSource[] {
  const cells = new Map<string, string>()
  const cellRe = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi
  let match: RegExpExecArray | null
  while ((match = cellRe.exec(html)) !== null) {
    const label = stripTags(match[1])
    const value = stripTags(match[2])
    if (label && value) cells.set(label, value)
  }
  const get = (pattern: RegExp) => {
    for (const [k, v] of cells) if (pattern.test(k) && !v.startsWith('=')) return v
    return null
  }

  const evidenceUrls: string[] = []
  const imgRe = /<div\s+class=["']?ws2015_evidence["']?[\s\S]*?<img[^>]+src=["']([^"']+)["']/gi
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgRe.exec(html)) !== null) {
    const url = resolveOrtDataUrl('ws2015', imgMatch[1])
    if (url && !evidenceUrls.includes(url)) evidenceUrls.push(url)
  }

  const candidates: Array<{ ref: string | null; region: string; citation: string | null; page: string | null }> = [
    { ref: get(/UK Source/i), region: 'UK', citation: get(/UK Ref\.\s*to Evidence doc/i), page: null },
    { ref: get(/UTC Source/i), region: 'UTC', citation: get(/UTC Evidence \(Title\)/i), page: get(/UTC Evidence \(Location\)/i) },
    { ref: get(/G Source/i), region: 'G', citation: get(/G Ref\.\s*to Evidence doc/i), page: get(/G Page No\./i) },
    { ref: get(/T Source/i), region: 'T', citation: get(/T References to evidence documents A/i), page: get(/T References to evidence documents B/i) },
    { ref: get(/K Source/i), region: 'K', citation: get(/K Ref\.\s*to Evidence doc/i), page: null },
    { ref: get(/SAT Source/i), region: 'SAT', citation: get(/SAT Evidence/i), page: null },
  ]

  const sources: OrtEvidenceSource[] = []
  for (const item of candidates) {
    if (!item.ref) continue
    const combined = [item.citation, item.page].filter(Boolean).join(', ')
    const parsed = combined ? parseCitationText(combined) : { title: null, reportDate: null, page: null }
    sources.push({
      sourceRef: item.ref,
      region: item.region,
      title: parsed.title,
      reportDate: parsed.reportDate,
      page: item.page ?? parsed.page,
      citation: cleanText(combined, 500) ?? `${WS_SHORT.ws2015} ${item.ref}`,
      directUrl: combined ? firstUrl(combined) : null,
      evidenceUrls: evidenceUrls.slice(0, 5),
      notes: [],
    })
  }
  return sources
}

/**
 * Parses an HTML response from `hc.jsecs.org/irg/ws20XX/app/index.php` into structured bibliographic
 * evidence entries and IRG discussion records, or returns null when the page holds no record.
 */
export function parseOrtPage(html: string, ws: OrtWorkingSet, pageUrl: string): OrtRecord | null {
  if (!html || !html.includes('<title>')) return null
  const serial = extractSerial(html)
  const discussions = extractDiscussions(html)
  const attr = /data-evidence="([^"]+)"/i.exec(html)
  const sources = attr ? parseModernEvidences(ws, attr[1]) : ws === 'ws2015' ? parseWs2015Table(html) : []
  if (!sources.length) return null
  return { ws, serial, pageUrl, sources, discussions }
}

/**
 * Maps one ORT evidence source into an RCC `SightingFields` payload: cites the original work,
 * places the IRG Working Set ORT page in `vias`, and links evidence scans in `note` without
 * mirroring copyrighted images.
 */
export function mapOrtSourceToSighting(record: OrtRecord, source: OrtEvidenceSource): SightingFields {
  const canonicalViaUrl = record.serial
    ? `https://hc.jsecs.org/irg/${record.ws}/app/index.php?id=${record.serial}`
    : cleanSourceUrl(record.pageUrl) ?? record.pageUrl

  const viaTitle = record.serial
    ? `${WS_SHORT[record.ws]}-${record.serial} (${source.sourceRef})`
    : `${WS_SHORT[record.ws]} (${source.sourceRef})`

  const vias: Via[] = [{
    url: canonicalViaUrl,
    title: viaTitle,
    author: null,
    publisher: 'IRG Online Review Tool',
    report_date: null,
    container: WS_LABELS[record.ws],
    source_kind: null,
    quote: null,
  }].slice(0, VIAS_MAX)

  const placeParts = [source.title, source.page].filter((part): part is string => Boolean(part))
  const place = (placeParts.join(', ') || source.citation || viaTitle).slice(0, 500)

  const noteLines: string[] = [`IRG source: ${source.sourceRef}`]
  for (const extra of source.notes) noteLines.push(extra)
  if (record.discussions.length) {
    const summary = record.discussions
      .slice(0, 3)
      .map(d => (d.meeting ? `${d.meeting}: ${d.text}` : d.text))
      .join(' | ')
    noteLines.push(`IRG discussion: ${summary}`)
  }
  for (const url of source.evidenceUrls) noteLines.push(`ORT evidence: ${url}`)

  return {
    place,
    url: source.directUrl,
    title: source.title,
    author: null,
    publisher: null,
    report_date: source.reportDate,
    container: null,
    source_kind: null,
    vias,
    original_date: null,
    page: source.page,
    contexts: null,
    style: null,
    types: storeChosen(SIGHTING_TYPES, new Set(['attestation'])),
    note: noteLines.join('\n').slice(0, 5000),
    quotes: null,
    closeness: null,
  }
}
