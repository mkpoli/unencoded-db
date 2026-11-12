// What a browser does to a picture before it leaves: turns it upright, sizes it, and writes a new file, which
// drops what the camera recorded. The thumbnail is the marked character, or the whole picture when none is marked.
export const LONG_SIDE = 3200
export const THUMB_SIDE = 640

export type Box = [number, number, number, number]
export type Prepared = { file: File; bitmap: ImageBitmap; width: number; height: number }

function canvasOf(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function blobOf(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('encode')), type, quality))
}

// WebP where the browser writes it, and JPEG where it does not (Safari answers PNG when asked for WebP).
async function lossy(canvas: HTMLCanvasElement, quality: number) {
  const webp = await blobOf(canvas, 'image/webp', quality)
  if (webp.type === 'image/webp') return webp
  return blobOf(canvas, 'image/jpeg', quality)
}

const EXTENSION: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const named = (blob: Blob, stem: string) => new File([blob], `${stem}.${EXTENSION[blob.type] ?? 'img'}`, { type: blob.type })

export async function prepare(source: Blob): Promise<Prepared> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale)
  const canvas = canvasOf(width, height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  // A small PNG is usually a screenshot, and it stays lossless.
  const blob = source.type === 'image/png' && source.size < 4 * 1024 * 1024 ? await blobOf(canvas, 'image/png') : await lossy(canvas, 0.92)
  return { file: named(blob, 'evidence'), bitmap: await createImageBitmap(canvas), width, height }
}

export async function thumbnail(bitmap: ImageBitmap, box: Box | null) {
  const [x, y, w, h] = box ?? [0, 0, bitmap.width, bitmap.height]
  const scale = Math.min(1, THUMB_SIDE / Math.max(w, h))
  const canvas = canvasOf(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
  canvas.getContext('2d')!.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height)
  return named(await lossy(canvas, 0.85), 'thumb')
}

// The evidence file IRG asks for: the whole page, a red square that clears the character by a margin, and a
// size under 1 MB, preferably under 400 KB (IRG Principles & Procedures, Version 18).
const WANTED = 400 * 1024, CEILING = 1024 * 1024

export async function evidenceFile(url: string, box: Box | null, stem: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob())
  let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  let last: Blob | null = null
  for (let attempt = 0; attempt < 7; attempt++) {
    const width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale)
    const canvas = canvasOf(width, height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0, width, height)
    if (box) {
      const margin = Math.max(4, Math.round(Math.min(box[2], box[3]) * scale * 0.12))
      context.strokeStyle = '#e0241b'
      context.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 400))
      context.strokeRect(box[0] * scale - margin, box[1] * scale - margin, box[2] * scale + margin * 2, box[3] * scale + margin * 2)
    }
    last = await blobOf(canvas, 'image/jpeg', attempt < 3 ? 0.86 : 0.74)
    if (last.size <= WANTED) break
    if (attempt >= 3 && last.size <= CEILING) break
    scale *= 0.82
  }
  return named(last!, stem)
}
