import { expect, test } from 'bun:test'
import { sniff } from './image'
import { isPdf, PDF_SIDE, renderPdfPage } from './pdf'

/** A PDF of blank pages, each `[width, height]` in points, with a filled square on the first. */
export function pdfOf(sizes: readonly (readonly [number, number])[]) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${sizes.length} /Kids [${sizes.map((_, index) => `${index + 4} 0 R`).join(' ')}] >>`,
    '<< /Length 20 >>\nstream\n10 10 50 50 re f\nendstream',
    ...sizes.map(([width, height], index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]${index ? '' : ' /Contents 3 0 R'} >>`),
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

test('a PDF page is drawn as a WebP whose longer side is fixed', async () => {
  const pdf = pdfOf([[600, 300], [200, 400]])
  expect(isPdf(pdf)).toBe(true)
  const first = await renderPdfPage(pdf)
  expect(first).toMatchObject({ width: PDF_SIDE, height: PDF_SIDE / 2, pages: 2 })
  expect(sniff(first!.bytes)).toEqual({ type: 'image/webp', width: PDF_SIDE, height: PDF_SIDE / 2 })
  expect(await renderPdfPage(pdf, 2)).toMatchObject({ width: PDF_SIDE / 2, height: PDF_SIDE })
}, 30_000)

test('a page the file lacks, or a file that is no PDF, draws nothing', async () => {
  const pdf = pdfOf([[600, 300]])
  expect(await renderPdfPage(pdf, 2)).toBeNull()
  expect(await renderPdfPage(pdf, 0)).toBeNull()
  expect(await renderPdfPage(new TextEncoder().encode('%PDF-1.4\nnothing here'))).toBeNull()
  expect(isPdf(new Uint8Array([137, 80, 78, 71]))).toBe(false)
}, 30_000)
