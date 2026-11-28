// Unicode Technical Committee (L2), IRG and WG2 documents that discuss a recorded character.
// Document numbers are stored in one normalized form so searches and links work consistently;
// L2 numbers resolve to Unicode's document lookup when no direct link is given.

export type UnicodeDocument = { doc: string; page: string | null; url: string | null }

export const DOCUMENT_NUMBER_MAX = 40
export const DOCUMENT_PAGE_MAX = 80
export const DOCUMENT_URL_MAX = 1000

const L2_MATCH = /^L2\s*\/\s*(\d{2})\s*[-–—]\s*(\d{3}[A-Za-z0-9-]*)$/i
const IRG_MATCH = /^IRG\s*N\s*(\d{1,5}[A-Za-z0-9-]*)$/i
const WG2_MATCH = /^WG2\s*N\s*(\d{1,5}[A-Za-z0-9-]*)$/i

const L2_VALID = /^L2\/\d{2}-\d{3}[A-Z0-9-]*$/
const IRG_VALID = /^IRG N\d{1,5}[A-Z0-9-]*$/
const WG2_VALID = /^WG2 N\d{1,5}[A-Z0-9-]*$/
const L2_BASE = /^(L2\/\d{2}-\d{3})/

/** Normalize an L2, IRG or WG2 document number into its canonical written form. */
export function normalizeDocumentNumber(value: string): string {
  const text = value.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const l2 = L2_MATCH.exec(text)
  if (l2) return `L2/${l2[1]}-${l2[2].toUpperCase()}`
  const irg = IRG_MATCH.exec(text)
  if (irg) return `IRG N${irg[1].toUpperCase()}`
  const wg2 = WG2_MATCH.exec(text)
  if (wg2) return `WG2 N${wg2[1].toUpperCase()}`
  return text
}

/** Whether a normalized value is a supported Unicode (L2), IRG or WG2 document number. */
export function validDocumentNumber(value: string): boolean {
  return value.length <= DOCUMENT_NUMBER_MAX && (L2_VALID.test(value) || IRG_VALID.test(value) || WG2_VALID.test(value))
}

/** Whether a value is a trimmed http(s) web address within the stored length limit. */
export function validDocumentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > DOCUMENT_URL_MAX || value !== value.normalize('NFC').trim()) return false
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** The link for a document: an explicit http(s) URL when valid, Unicode's L2 resolver for L2 documents, or null. */
export function documentUrl(doc: string, explicitUrl?: string | null): string | null {
  const explicit = typeof explicitUrl === 'string' ? explicitUrl.normalize('NFC').trim() : ''
  if (explicit && validDocumentUrl(explicit)) return explicit
  const normalized = normalizeDocumentNumber(doc)
  if (!validDocumentNumber(normalized)) return null
  const base = L2_BASE.exec(normalized)
  return base ? `https://www.unicode.org/cgi-bin/GetMatchingDocs.pl?${encodeURIComponent(base[1])}` : null
}

/** Format a document page reference, avoiding a doubled `p.` prefix. */
export function formatDocumentPage(page: string): string {
  const trimmed = page.trim()
  if (!trimmed) return ''
  return /^pp?\.\s*/i.test(trimmed) ? trimmed : `p. ${trimmed}`
}

/** Format a document number with its optional page reference (e.g. `L2/25-056 p. 12`). */
export function formatDocument(doc: string, page?: string | null): string {
  const formattedPage = page ? formatDocumentPage(page) : ''
  return formattedPage ? `${doc} ${formattedPage}` : doc
}
