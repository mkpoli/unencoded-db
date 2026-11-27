import { error } from '@sveltejs/kit'
import { MAX_IMAGE } from '$lib/server/image'
import { heavyJpx, isPdf, renderPdfPage } from '$lib/server/pdf'
import type { RequestHandler } from './$types'

// One page of a PDF someone chose as a picture, drawn and sent back as an image for the form to mark and
// send like any other. Nothing is kept. The request's body is the PDF itself, which no other site's form
// can send, and the origin is checked all the same.
export const POST: RequestHandler = async (event) => {
  if (event.request.headers.get('origin') !== event.url.origin) error(403)
  const page = Number(event.url.searchParams.get('page') ?? '1')
  const bytes = new Uint8Array(await event.request.arrayBuffer())
  if (!bytes.byteLength || !isPdf(bytes)) error(422, 'pdf')
  // A file the site cannot draw for its size is named apart, so the form can ask for a picture of the page.
  if (bytes.byteLength > MAX_IMAGE || heavyJpx(bytes)) error(422, 'large')
  const drawn = await renderPdfPage(bytes, page)
  if (!drawn) error(422, 'page')
  return new Response(drawn.bytes as BodyInit, { headers: { 'content-type': 'image/webp', 'cache-control': 'no-store', 'x-pdf-pages': String(drawn.pages) } })
}
