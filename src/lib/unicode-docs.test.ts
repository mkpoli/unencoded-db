import { describe, expect, test } from 'bun:test'
import { DOCUMENT_NUMBER_MAX, documentUrl, formatDocument, formatDocumentPage, normalizeDocumentNumber, validDocumentNumber, validDocumentUrl } from './unicode-docs'

describe('normalizeDocumentNumber', () => {
  test('normalizes L2 document numbers', () => {
    expect(normalizeDocumentNumber('l2/25-056')).toBe('L2/25-056')
    expect(normalizeDocumentNumber('  L2/25-056r  ')).toBe('L2/25-056R')
    expect(normalizeDocumentNumber('l2/25-056r2')).toBe('L2/25-056R2')
    expect(normalizeDocumentNumber('L2 / 25–056')).toBe('L2/25-056')
  })

  test('normalizes IRG document numbers', () => {
    expect(normalizeDocumentNumber('irg n2850')).toBe('IRG N2850')
    expect(normalizeDocumentNumber('IRGN2850R')).toBe('IRG N2850R')
    expect(normalizeDocumentNumber('IRG N1199')).toBe('IRG N1199')
    expect(normalizeDocumentNumber('irg   n  2850r2')).toBe('IRG N2850R2')
  })

  test('normalizes WG2 document numbers', () => {
    expect(normalizeDocumentNumber('wg2 n5234')).toBe('WG2 N5234')
    expect(normalizeDocumentNumber('WG2N5234')).toBe('WG2 N5234')
    expect(normalizeDocumentNumber('WG2 N5234R')).toBe('WG2 N5234R')
  })

  test('trims unrecognized strings without crashing', () => {
    expect(normalizeDocumentNumber('   ')).toBe('')
    expect(normalizeDocumentNumber('  ISO 10646  ')).toBe('ISO 10646')
  })
})

describe('validDocumentNumber', () => {
  test('accepts normalized L2, IRG and WG2 document numbers', () => {
    for (const doc of ['L2/25-056', 'L2/25-056R', 'L2/25-056R2', 'L2/99-001-1', 'IRG N1', 'IRG N1199', 'IRG N2850R', 'WG2 N5234', 'WG2 N5234-A']) {
      expect(validDocumentNumber(doc)).toBe(true)
    }
  })

  test('rejects unnormalized, malformed or overlong document numbers', () => {
    for (const bad of ['', 'l2/25-056', 'L2/25-56', 'L2/2025-056', 'IRGN2850', 'irg n2850', 'WG2N5234', 'N2850', 'L2/25-056 extra', `L2/25-056${'R'.repeat(DOCUMENT_NUMBER_MAX)}`]) {
      expect(validDocumentNumber(bad)).toBe(false)
    }
  })
})

describe('validDocumentUrl and documentUrl', () => {
  test('validates http and https URLs only', () => {
    expect(validDocumentUrl('https://www.unicode.org/L2/L2025/25056-uax45-3-abbreviated%20ideographs.pdf')).toBe(true)
    expect(validDocumentUrl('http://appsrv.cse.cuhk.edu.hk/~irg/irg/irg58/IRGN2550.pdf')).toBe(true)
    for (const bad of ['', 'javascript:alert(1)', 'ftp://example.com/doc.pdf', 'https://', ' https://example.com', `https://example.com/${'a'.repeat(1000)}`]) {
      expect(validDocumentUrl(bad)).toBe(false)
    }
  })

  test('prefers an explicit valid http(s) URL', () => {
    const pdf = 'https://www.unicode.org/L2/L2025/25056-uax45-3-abbreviated%20ideographs.pdf'
    expect(documentUrl('L2/25-056', pdf)).toBe(pdf)
    expect(documentUrl('IRG N2850', 'https://www.unicode.org/irg/docs/n2850.pdf')).toBe('https://www.unicode.org/irg/docs/n2850.pdf')
  })

  test('derives Unicode resolver URL for L2 documents without an explicit URL', () => {
    expect(documentUrl('L2/25-056')).toBe('https://www.unicode.org/cgi-bin/GetMatchingDocs.pl?L2%2F25-056')
    expect(documentUrl('L2/25-056R2', null)).toBe('https://www.unicode.org/cgi-bin/GetMatchingDocs.pl?L2%2F25-056')
    expect(documentUrl('L2/25-056', 'javascript:alert(1)')).toBe('https://www.unicode.org/cgi-bin/GetMatchingDocs.pl?L2%2F25-056')
  })

  test('returns null for IRG and WG2 documents without an explicit URL', () => {
    expect(documentUrl('IRG N2850')).toBeNull()
    expect(documentUrl('IRG N2850', '')).toBeNull()
    expect(documentUrl('WG2 N5234', null)).toBeNull()
    expect(documentUrl('not-a-doc')).toBeNull()
  })

  test('formats document pages cleanly', () => {
    expect(formatDocumentPage('12')).toBe('p. 12')
    expect(formatDocumentPage('p. 12')).toBe('p. 12')
    expect(formatDocumentPage('pp. 12–14')).toBe('pp. 12–14')
    expect(formatDocument('L2/25-056', '12')).toBe('L2/25-056 p. 12')
    expect(formatDocument('IRG N2850', null)).toBe('IRG N2850')
  })
})
