import { isShuishu } from 'han-compose/tree'
import { contours } from 'd3-contour'
import { Path } from 'opentype.js'
import { openTypeFont, missingOutline, outline } from './pua-font'
import type { GlyphStyle } from './composer'

type Row = { id: number; ids: string | null; layout: string | null; cover_key: string | null; marked_sighting: number | null }
type Face = { style: GlyphStyle; version: string; source: string }
export const faceNames: Record<GlyphStyle, string> = {
  sans: 'Sans', serif: 'Serif', fangsong: 'Fangsong', regular: 'Kai', 'pen-writing': 'Pen'
}
export type FontCatalogue = { records: Row[]; styles: Face[] }

// Rendering the complete plate first preserves masks, clipping and transforms in adjusted layouts.
async function trace(blob: Blob, size: number, evidence = false) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, size, size)
    const scale = size / Math.max(image.naturalWidth, image.naturalHeight)
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
    const { data } = ctx.getImageData(0, 0, size, size)
    const ink = Array.from({ length: size * size }, (_, i) =>
      255 - (data[4*i] * 0.299 + data[4*i+1] * 0.587 + data[4*i+2] * 0.114))
    if (evidence) {
      const left = Math.floor((size - w) / 2), right = size - 1 - left
      const top = Math.floor((size - h) / 2), bottom = size - 1 - top
      const corners = [ink[top * size + left], ink[top * size + right], ink[bottom * size + left], ink[bottom * size + right]]
      if (corners.filter(value => value > 128).length >= 3) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = y * size + x
            ink[i] = x >= left && x <= right && y >= top && y <= bottom ? 255 - ink[i] : 0
          }
        }
      }
    }
    const shape = contours().size([size, size]).contour(ink, 128)
    const path = new Path()
    for (const polygon of shape.coordinates) {
      for (const ring of polygon) {
        ring.slice(0, -1).forEach(([x, y], i) => {
          const px = x * 1000 / size, py = 880 - y * 1000 / size
          if (i === 0) path.moveTo(px, py)
          else path.lineTo(px, py)
        })
        path.close()
      }
    }
    return path
  } finally { URL.revokeObjectURL(url) }
}

export async function drawing(row: Row, face: Face, covers: Map<string, Promise<Path | null>>, signal?: AbortSignal) {
  // The upstream chart font has no stated redistribution permission, including for components.
  if (isShuishu(row.ids)) return { path: missingOutline(), source: 'placeholder-shuishu' }
  if (row.ids) {
    const query = new URLSearchParams({ ids: row.ids, style: face.style, v: face.version })
    if (row.layout) query.set('layout', row.layout)
    const url = '/api/glyph?' + query
    let response = await fetch(url, { signal })
    if (response.status === 503) response = await fetch(url, { cache: 'reload', signal })
    if (response.ok) {
      const { d } = await response.json() as { d: string }
      const path = d.startsWith('<')
        ? await trace(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">', d, '</svg>'], { type: 'image/svg+xml' }), 512)
        : outline(d)
      if (path.commands.length) return { path, source: 'composer' }
    } else if (response.status !== 404) throw new Error('HTTP ' + response.status)
  }
  if (row.cover_key && row.marked_sighting) {
    const key = row.cover_key
    let pending = covers.get(key)
    if (!pending) {
      pending = fetch('/media/v2/' + key, { signal }).then(async response => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const blob = await response.blob()
        try { return await trace(blob, 128, true) }
        catch (error) {
          if (error instanceof DOMException && error.name === 'EncodingError') return null
          throw error
        }
      })
      covers.set(key, pending)
    }
    const path = await pending
    if (path?.commands.length) return { path, source: 'evidence' }
  }
  return { path: missingOutline(), source: 'placeholder' }
}

export async function previewFont(records: Row[], face: Face, signal: AbortSignal) {
  const covers = new Map<string, Promise<Path | null>>()
  const glyphs = []
  for (let i = 0; i < records.length; i += 4) {
    signal.throwIfAborted()
    const group = records.slice(i, i + 4)
    const drawn = await Promise.all(group.map(row => drawing(row, face, covers, signal)))
    glyphs.push(...drawn.map(({ path }, j) => ({ id: group[j].id, path })))
  }
  signal.throwIfAborted()
  return openTypeFont(faceNames[face.style], glyphs, new Date()).otf
}
