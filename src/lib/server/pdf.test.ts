import { expect, test } from 'bun:test'
import { sniff } from './image'
import { heavyJpx, isPdf, JPX_PIXELS, PDF_PIXELS, PDF_SIDE, renderPdfPage } from './pdf'

/** A PDF of blank pages, each `[width, height]` in points, with a filled square on the first, and any further objects given. */
export function pdfOf(sizes: readonly (readonly [number, number])[], extra: readonly string[] = []) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${sizes.length} /Kids [${sizes.map((_, index) => `${index + 4} 0 R`).join(' ')}] >>`,
    '<< /Length 20 >>\nstream\n10 10 50 50 re f\nendstream',
    ...sizes.map(([width, height], index) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]${index ? '' : ' /Contents 3 0 R'} >>`),
    ...extra,
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
  // A square page is held to the pixel allowance.
  const square = await renderPdfPage(pdfOf([[500, 500]]))
  expect(square!.width).toBe(Math.round(Math.sqrt(PDF_PIXELS)))
  expect(square!.width * square!.height).toBeLessThanOrEqual(PDF_PIXELS * 1.001)
}, 30_000)

test('a page the file lacks, or a file that is no PDF, draws nothing', async () => {
  const pdf = pdfOf([[600, 300]])
  expect(await renderPdfPage(pdf, 2)).toBeNull()
  expect(await renderPdfPage(pdf, 0)).toBeNull()
  expect(await renderPdfPage(new TextEncoder().encode('%PDF-1.4\nnothing here'))).toBeNull()
  expect(isPdf(new Uint8Array([137, 80, 78, 71]))).toBe(false)
}, 30_000)

/** An image object's dictionary with an empty stream, which is all heavyJpx reads. */
export const imageObject = (width: number | string, height: number | string, filter: string) =>
  `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length 0 >>\nstream\n\nendstream`

test('a JPEG 2000 image too large to draw is found before drawing', () => {
  const scan = imageObject(3433, 2706, '/JPXDecode')
  expect(heavyJpx(pdfOf([[600, 300]], [scan]))).toEqual({ width: 3433, height: 2706 })
  expect(heavyJpx(pdfOf([[600, 300]], [imageObject(2000, 3000, '/JPXDecode'), scan]))).toEqual({ width: 3433, height: 2706 })
  expect(heavyJpx(pdfOf([[600, 300]], [imageObject(2000, 3000, '[/FlateDecode /JPXDecode]')]))).toEqual({ width: 2000, height: 3000 })
  // Under the allowance, in another format, or with a size the dictionary does not state, the page is drawn.
  expect(heavyJpx(pdfOf([[600, 300]], [imageObject(1500, 2000, '/JPXDecode')]))).toBeNull()
  expect(JPX_PIXELS).toBeLessThan(2000 * 3000)
  expect(heavyJpx(pdfOf([[600, 300]], [imageObject(4000, 4000, '/DCTDecode')]))).toBeNull()
  expect(heavyJpx(pdfOf([[600, 300]], [imageObject('12 0 R', '13 0 R', '/JPXDecode')]))).toBeNull()
  expect(heavyJpx(pdfOf([[600, 300]]))).toBeNull()
  // Keys in any order, with or without spaces, and a name that holds the word stream.
  expect(heavyJpx(pdfOf([[600, 300]], ['<</Subtype/Image/Height 3000/Filter/JPXDecode/Width 2000/Length 0>>\nstream\n\nendstream']))).toEqual({ width: 2000, height: 3000 })
  expect(heavyJpx(pdfOf([[600, 300]], ['<< /Subtype /Image /Filter /JPXDecode /Upstream 1 /Width 2000 /Height 3000 /Length 0 >>\nstream\n\nendstream']))).toEqual({ width: 2000, height: 3000 })
})
