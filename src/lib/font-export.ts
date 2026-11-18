import { isShuishu } from 'han-compose/tree'
import { contours } from 'd3-contour'
import { strToU8, zipSync } from 'fflate'
import { Path } from 'opentype.js'
import { recordCode } from './code'
import { fontFiles, missingOutline, outline, privateCode } from './pua-font'
import type { GlyphStyle } from './composer'
import { cleanLayout, layoutForStyle, layoutText } from './layout'

type Row = { id: number; ids: string | null; layout: string | null; cover_key: string | null; marked_sighting: number | null }
type Face = { style: GlyphStyle; version: string; adjustedVersion?: string; source: string }
const names: Record<GlyphStyle, string> = {
  sans: 'Sans', serif: 'Serif', fangsong: 'Fangsong', regular: 'Kai', 'pen-writing': 'Pen'
}
const notices = import.meta.glob('../../node_modules/{han-compose/data/licences,ids-input/fonts}/{*.txt,OFL*.md}', {
  eager: true, query: '?raw', import: 'default'
}) as Record<string, string>

async function checked(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response
}

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

async function drawing(row: Row, face: Face, covers: Map<string, Promise<Path | null>>) {
  // The upstream chart font has no stated redistribution permission, including for components.
  if (isShuishu(row.ids)) return { path: missingOutline(), source: 'placeholder-shuishu' }
  if (row.ids) {
    const layout = layoutText(layoutForStyle(cleanLayout(row.layout, row.ids), face.style))
    const version = layout ? face.adjustedVersion ?? face.version : face.version
    const query = new URLSearchParams({ ids: row.ids, style: face.style, v: version })
    if (layout) query.set('layout', layout)
    const url = '/api/glyph?' + query
    let response = await fetch(url)
    if (response.status === 503) response = await fetch(url, { cache: 'reload' })
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
      pending = fetch('/media/v2/' + key).then(async response => {
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

export async function exportFonts(progress: (done: number, total: number) => void) {
  const response = await checked('/api/font-export', { cache: 'no-store' })
  const { records, styles }: { records: Row[]; styles: Face[] } = await response.json()
  const date = new Date()
  const files: Record<string, Uint8Array> = {}
  for (const [path, notice] of Object.entries(notices)) {
    files['licences/' + path.split('node_modules/')[1]] = strToU8(notice)
  }
  const mapping = records.map(row => ({ record: recordCode(row.id), unicode: 'U+' + privateCode(row.id).toString(16).toUpperCase(),
    evidence: row.marked_sighting ? new URL('/en/entry/' + row.id + '#sighting-' + row.marked_sighting, location.origin).href : undefined,
    character: String.fromCodePoint(privateCode(row.id)), sources: {} as Record<string, string> }))
  const covers = new Map<string, Promise<Path | null>>()
  // The CFF charset includes standard strings and a custom string for each glyph name.
  const partSize = 16000
  let done = 0
  const total = records.length * styles.length
  for (const face of styles) {
    const manifest = await (await checked(face.source + '/manifest.json')).json() as { licences: unknown }
    files['licences/' + face.style + '.json'] = strToU8(JSON.stringify(manifest.licences, null, 2))
    for (let start = 0; start < records.length || start === 0; start += partSize) {
      const batch = records.slice(start, start + partSize)
      const glyphs = []
      for (let first = 0; first < batch.length; first += 4) {
        const group = batch.slice(first, first + 4)
        const drawn = await Promise.all(group.map(row => drawing(row, face, covers)))
        for (const [i, { path, source }] of drawn.entries()) {
          mapping[start + first + i].sources[face.style] = source
          glyphs.push({ id: group[i].id, path })
        }
        done += group.length
        progress(done, total)
      }
      const part = start > 0 ? ' ' + (1 + start / partSize) : ''
      Object.assign(files, fontFiles(names[face.style] + part, glyphs, date))
    }
  }
  files['licences/records.txt'] = strToU8('Rare Character Compendium records and descriptions: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Evidence images retain the rights of their sources. See the sighting citations in mapping.json.')
  files['mapping.json'] = strToU8(JSON.stringify({ generated: date.toISOString(), styles, records: mapping }, null, 2))
  return new Blob([new Uint8Array(zipSync(files, { level: 3 }))], { type: 'application/zip' })
}
