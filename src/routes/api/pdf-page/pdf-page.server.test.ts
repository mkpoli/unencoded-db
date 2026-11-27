import { expect, test } from 'bun:test'
import { sniff } from '$lib/server/image'
import { pdfOf } from '$lib/server/pdf.test'
import { POST } from './+server'

const ask = (body: Uint8Array, page: string, origin = 'https://site.example') => POST({
  url: new URL(`https://site.example/api/pdf-page?page=${page}`),
  request: new Request('https://site.example/api/pdf-page', { method: 'POST', headers: { origin, 'content-type': 'application/pdf' }, body: body as BodyInit }),
} as never) as Promise<Response>

const status = (call: Promise<unknown>) => call.then(() => 200, (thrown: { status: number }) => thrown.status)

test('a page of a PDF comes back as a picture, with the number of pages', async () => {
  const response = await ask(pdfOf([[595, 842], [842, 595]]), '2')
  expect(response.headers.get('x-pdf-pages')).toBe('2')
  const found = sniff(new Uint8Array(await response.arrayBuffer()))
  expect(found?.type).toBe('image/webp')
  expect(found!.width).toBeGreaterThan(found!.height)
})

test('another site, a missing page and a file that is no PDF are refused', async () => {
  const pdf = pdfOf([[595, 842]])
  expect(await status(ask(pdf, '1', 'https://other.example'))).toBe(403)
  expect(await status(ask(pdf, '2'))).toBe(422)
  expect(await status(ask(new TextEncoder().encode('plain text'), '1'))).toBe(422)
})
