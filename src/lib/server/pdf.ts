import { PDFiumLibrary } from '@hyzyla/pdfium'
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode.js'

// A PDF page given as a picture is drawn once, here, and kept as the WebP it draws to. The page's longer
// side comes out at PDF_SIDE pixels, so marks can be measured on any rendering made to that size.
export const PDF_SIDE = 2400
export const PDF_QUALITY = 85

export const isPdf = (bytes: Uint8Array) => {
  // The header may follow a few bytes of padding.
  const head = String.fromCharCode(...bytes.subarray(0, 1024))
  return head.includes('%PDF-')
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
    const scale = PDF_SIDE / Math.max(originalWidth, originalHeight)
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
