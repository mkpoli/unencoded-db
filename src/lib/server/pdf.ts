import { PDFiumLibrary } from '@hyzyla/pdfium'
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode.js'

// A PDF page given as a picture is drawn once, here, and kept as the WebP it draws to. The page's longer
// side comes out at PDF_SIDE pixels, so marks can be measured on any rendering made to that size. A page
// nearer to square than a sheet of paper is drawn smaller, to PDF_PIXELS in all: the drawing and its
// encoding each hold the whole bitmap in a Worker's memory.
export const PDF_SIDE = 2400
export const PDF_PIXELS = 4_200_000
export const PDF_QUALITY = 85

// The header may follow a few bytes of padding.
export const isPdf = (bytes: Uint8Array) => String.fromCharCode(...bytes.subarray(0, 1024)).includes('%PDF-')

// PDFium decodes a JPEG 2000 image at four bytes a sample, so drawing one takes about 18 MB of its heap a
// megapixel, against about 5 MB for a JPEG. A page scanned to a 9-megapixel JPEG 2000 image grew the heap
// past 190 MB and stopped the Worker. Three megapixels keep the heap near that of the largest JPEG pages
// drawn so far.
export const JPX_PIXELS = 3_000_000

/**
 * The largest JPEG 2000 image in a PDF when it is over JPX_PIXELS, else null. An image's dictionary is
 * never compressed, so it is read from the file's own bytes, before anything is drawn.
 */
export function heavyJpx(pdf: Uint8Array): { width: number; height: number } | null {
  const text = new TextDecoder('latin1').decode(pdf)
  let heaviest: { width: number; height: number } | null = null
  for (let at = text.indexOf('/JPXDecode'); at >= 0; at = text.indexOf('/JPXDecode', at + 1)) {
    const start = text.lastIndexOf(' obj', at)
    const end = text.indexOf('stream', at)
    const dictionary = text.slice(Math.max(0, start), end < 0 ? at + 4096 : end)
    const width = Number(/\/Width\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionary)?.[1])
    const height = Number(/\/Height\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dictionary)?.[1])
    if (width * height > JPX_PIXELS && width * height > (heaviest ? heaviest.width * heaviest.height : 0)) heaviest = { width, height }
  }
  return heaviest
}

// Wrangler hands a `.wasm` import over compiled. A test runner hands over the file's path.
async function compiled(imported: unknown) {
  if (imported instanceof WebAssembly.Module) return imported
  const { readFile } = await import('node:fs/promises')
  return WebAssembly.compile(await readFile(String(imported)))
}

type Instantiate = (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module?: WebAssembly.Module) => void) => WebAssembly.Exports
const instantiate = (module: WebAssembly.Module): Instantiate => (imports, receive) => {
  const instance = new WebAssembly.Instance(module, imports)
  receive(instance, module)
  return instance.exports
}

let library: Promise<PDFiumLibrary> | undefined
let encoder: Promise<unknown> | undefined

function pdfium() {
  library ??= import('@hyzyla/pdfium/pdfium.wasm')
    .then(({ default: wasm }) => compiled(wasm))
    .then(module => PDFiumLibrary.init({ instantiateWasm: instantiate(module) as never }))
    .catch(error => { library = undefined; throw error })
  return library
}

function webp() {
  encoder ??= import('@jsquash/webp/codec/enc/webp_enc.wasm')
    .then(({ default: wasm }) => compiled(wasm))
    .then(module => initWebp({ instantiateWasm: instantiate(module) } as never))
    .catch(error => { encoder = undefined; throw error })
  return encoder
}

export type PdfPage = { bytes: Uint8Array; width: number; height: number; pages: number }

/** One page of a PDF as a WebP, or null when the file does not open or has no such page. Pages count from 1. */
export async function renderPdfPage(pdf: Uint8Array, page = 1): Promise<PdfPage | null> {
  const [lib] = await Promise.all([pdfium(), webp()])
  let document
  try { document = await lib.loadDocument(pdf) } catch { return null }
  try {
    const pages = document.getPageCount()
    if (!Number.isInteger(page) || page < 1 || page > pages) return null
    const sheet = document.getPage(page - 1)
    const { originalWidth, originalHeight } = sheet.getOriginalSize()
    if (!(originalWidth > 0) || !(originalHeight > 0)) return null
    const scale = Math.min(PDF_SIDE / Math.max(originalWidth, originalHeight), Math.sqrt(PDF_PIXELS / (originalWidth * originalHeight)))
    const width = Math.max(1, Math.round(originalWidth * scale))
    const height = Math.max(1, Math.round(originalHeight * scale))
    const drawn = await sheet.render({ width, height, render: 'bitmap', colorSpace: 'RGBA' })
    const data = new Uint8ClampedArray(drawn.data.buffer, drawn.data.byteOffset, drawn.data.byteLength)
    const bytes = new Uint8Array(await encodeWebp({ data, width: drawn.width, height: drawn.height, colorSpace: 'srgb' } as ImageData, { quality: PDF_QUALITY }))
    return { bytes, width: drawn.width, height: drawn.height, pages }
  } catch {
    return null
  } finally {
    document.destroy()
  }
}
