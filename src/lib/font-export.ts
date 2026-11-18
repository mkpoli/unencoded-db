import { strToU8, zipSync } from 'fflate'
import type { Path } from 'opentype.js'
import { recordCode } from './code'
import { fontFiles } from './font-files'
import { privateCode } from './private-code'
import { drawing, faceNames, type FontCatalogue } from './font-preview'

const notices = import.meta.glob('../../node_modules/{han-compose/data/licences,ids-input/fonts}/{*.txt,OFL*.md}', {
  eager: true, query: '?raw', import: 'default'
}) as Record<string, string>

async function checked(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response
}

export async function exportFonts(progress: (done: number, total: number) => void) {
  const response = await checked('/api/font-export', { cache: 'no-store' })
  const { records, styles }: FontCatalogue = await response.json()
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
      Object.assign(files, fontFiles(faceNames[face.style] + part, glyphs, date))
    }
  }
  files['licences/records.txt'] = strToU8('Rare Character Compendium records and descriptions: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Evidence images retain the rights of their sources. See the sighting citations in mapping.json.')
  files['mapping.json'] = strToU8(JSON.stringify({ generated: date.toISOString(), styles, records: mapping }, null, 2))
  return new Blob([new Uint8Array(zipSync(files, { level: 3 }))], { type: 'application/zip' })
}
