import { Font as TrueType } from 'fonteditor-core'
import { openTypeFont, type GlyphRecord } from './pua-font'

export function fontFiles(face: string, records: GlyphRecord[], date: Date) {
  const { stem, otf } = openTypeFont(face, records, date)
  const ttf = TrueType.create(otf, { type: 'otf' }).write({ type: 'ttf', toBuffer: false }) as ArrayBuffer
  return { [stem + '.otf']: new Uint8Array(otf), [stem + '.ttf']: new Uint8Array(ttf) }
}
