import { expect, test } from 'bun:test'
import { drawPdfPage } from './pdf'

test('a PDF the site refuses for its size is told apart from one it cannot read', async () => {
  const answer = (status: number, body: unknown) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch }
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
  answer(422, { message: 'large' })
  await expect(drawPdfPage(pdf, 1)).rejects.toThrow('large')
  answer(422, { message: 'page' })
  await expect(drawPdfPage(pdf, 1)).rejects.toThrow('pdf')
  globalThis.fetch = (async () => new Response('Internal Error', { status: 500 })) as unknown as typeof fetch
  await expect(drawPdfPage(pdf, 1)).rejects.toThrow('pdf')
})
