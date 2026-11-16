import { composerVersion, type GlyphStyle } from '$lib/composer'

export const PLATE_PX = 512

export type SpellingReport = {
  symptom: string
  contact: string
  sequence: string
  link: string
  style: GlyphStyle
  layout: string | null
  locale: string
  record: number
  image: Blob | null
}

/** The fields the intake reads, as the report dialog sends them. */
export function spellingForm(report: SpellingReport) {
  const form = new FormData()
  form.set('symptom', report.symptom)
  form.set('sequence', report.sequence)
  form.set('link', report.link)
  form.set('document', '{}')
  form.set('context', JSON.stringify({ site: 'rare', style: report.style, layout: report.layout, composerVersion: composerVersion(report.style), locale: report.locale, record: report.record }))
  if (report.contact) form.set('contact', report.contact)
  if (report.image) form.set('image', report.image, 'drawing.png')
  return form
}

export type Sent = { ok: true; url: string; number: number } | { ok: false; message: string | null }

/** Posts a report and reads the intake's answer: the issue it became, or the sentence it refused with. */
export async function sendSpelling(form: FormData, send: typeof fetch = fetch): Promise<Sent> {
  let response: Response
  try { response = await send('/api/report', { method: 'POST', body: form }) } catch { return { ok: false, message: null } }
  const answer: unknown = await response.json().catch(() => null)
  const field = (name: string) => (answer && typeof answer === 'object' ? (answer as Record<string, unknown>)[name] : undefined)
  if (response.ok && typeof field('url') === 'string' && typeof field('number') === 'number') return { ok: true, url: field('url') as string, number: field('number') as number }
  return { ok: false, message: typeof field('message') === 'string' ? (field('message') as string) : null }
}

/** A PNG of a plate's drawing, square on white, or null where the plate holds no drawing or the browser cannot make one. */
export async function plateImage(plate: SVGSVGElement | null): Promise<Blob | null> {
  if (!plate) return null
  const svg = plate.cloneNode(true) as SVGSVGElement
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', String(PLATE_PX))
  svg.setAttribute('height', String(PLATE_PX))
  // The plate's colour comes from its page's stylesheet, which does not travel with the markup.
  svg.setAttribute('fill', '#000')
  const address = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = address
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PLATE_PX
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#fff'
    context.fillRect(0, 0, PLATE_PX, PLATE_PX)
    context.drawImage(image, 0, 0, PLATE_PX, PLATE_PX)
    return await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'))
  } catch { return null } finally { URL.revokeObjectURL(address) }
}
