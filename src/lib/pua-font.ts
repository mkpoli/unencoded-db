import { Font, Glyph, Path } from 'opentype.js'
import { Font as TrueType } from 'fonteditor-core'
import svgpath from 'svgpath'

// Record IDs start at one. Leave holes for withdrawn records so existing text keeps its meaning.
export function privateCode(id: number) {
  let offset = id - 1
  for (const [start, end] of [[0xe000, 0xf8ff], [0xf0000, 0xffffd], [0x100000, 0x10fffd]]) {
    if (Number.isSafeInteger(offset) && offset >= 0 && offset <= end - start) return start + offset
    offset -= end - start + 1
  }
  throw new Error('Record ID exceeds Unicode private-use space')
}

export function outline(d: string) {
  const path = new Path()
  svgpath(d).abs().unshort().unarc().iterate((s, _, x, y) => {
    switch (s[0]) {
      case 'M': path.moveTo(s[1], 880 - s[2]); break
      case 'L': path.lineTo(s[1], 880 - s[2]); break
      case 'H': path.lineTo(s[1], 880 - y); break
      case 'V': path.lineTo(x, 880 - s[1]); break
      case 'Q': path.quadraticCurveTo(s[1], 880 - s[2], s[3], 880 - s[4]); break
      case 'C': path.curveTo(s[1], 880 - s[2], s[3], 880 - s[4], s[5], 880 - s[6]); break
      case 'Z': case 'z': path.close(); break
      default: throw new Error('Unsupported outline command')
    }
  })
  return path
}

export const missingOutline = () => outline('M100 100H900V900H100Z M150 150V850H850V150Z')

export function fontFiles(face: string, records: { id: number; path: Path }[], date: Date) {
  const family = 'Rare Character Compendium PUA ' + face
  const stem = family.replaceAll(' ', '') + '-Regular'
  const glyphs = [new Glyph({ name: '.notdef', advanceWidth: 1000, path: missingOutline() }),
    ...records.map(({ id, path }) => new Glyph({ name: 'r' + id.toString(16), unicode: privateCode(id), advanceWidth: 1000, path }))]
  const font = new Font({ familyName: family, styleName: 'Regular', fullName: family + ' Regular',
    postScriptName: stem, version: 'Version 1.000; ' + date.toISOString(), unitsPerEm: 1000,
    ascender: 880, descender: -120, createdTimestamp: Math.floor(date.getTime() / 1000),
    license: 'Component notices accompany this font in the licences directory.', glyphs })
  // OS/2 uses 16-bit first/last indices and separate bits for BMP and supplementary PUA.
  const first = records.length ? privateCode(records[0].id) : 0
  const last = records.length ? privateCode(records[records.length - 1].id) : 0
  Object.assign(font.tables.os2, {
    usFirstCharIndex: Math.min(first, 0xffff), usLastCharIndex: Math.min(last, 0xffff),
    ulUnicodeRange1: 0, ulUnicodeRange2: (first && first <= 0xf8ff ? 1 << 28 : 0) | (last > 0xffff ? 1 << 25 : 0),
    ulUnicodeRange3: last > 0xffff ? 1 << 26 : 0, ulCodePageRange1: 0
  })
  const otf = font.toArrayBuffer()
  const ttf = TrueType.create(otf, { type: 'otf' }).write({ type: 'ttf', toBuffer: false }) as ArrayBuffer
  return { [stem + '.otf']: new Uint8Array(otf), [stem + '.ttf']: new Uint8Array(ttf) }
}
