// A PDF chosen as a picture is drawn by the site, one page a request, and comes back as an image.

/** Whether a chosen file is a PDF, by its type or else by its first bytes. */
export async function isPdf(source: Blob) {
  if (source.type === 'application/pdf') return true
  if (source.type.startsWith('image/')) return false
  const head = new Uint8Array(await source.slice(0, 1024).arrayBuffer())
  return String.fromCharCode(...head).includes('%PDF-')
}

/** One page of a PDF as an image, with the number of pages the file holds. */
export async function drawPdfPage(pdf: Blob, page: number): Promise<{ image: Blob; pages: number }> {
  const response = await fetch(`/api/pdf-page?page=${page}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: pdf })
  if (!response.ok) throw new Error('pdf')
  return { image: await response.blob(), pages: Number(response.headers.get('x-pdf-pages')) || 1 }
}
