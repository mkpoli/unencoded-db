// Writes static/unihan/<block>.tsv: what Unihan gives each ideograph, in files of 256 code points named by
// the code point's upper digits in hex (`56.tsv` holds U+5600–U+56FF).
//
//   bun scripts/build-unihan.ts <Unihan.zip>
//
// <Unihan.zip> is https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip
// (sha256 4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e). The columns are in COLUMNS;
// a variant is written `field:character`. It needs `unzip`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { UNIHAN_COLUMNS, UNIHAN_VARIANTS } from '../src/lib/character-tables'

const [zip] = process.argv.slice(2)
if (!zip) throw new Error('usage: bun scripts/build-unihan.ts <Unihan.zip>')
const read = (name: string) => new TextDecoder().decode(Bun.spawnSync(['unzip', '-p', zip, name]).stdout)

const FIELDS: Record<string, (typeof UNIHAN_COLUMNS)[number]> = {
  kRSUnicode: 'radical', kTotalStrokes: 'strokes', kDefinition: 'definition', kMandarin: 'cmn', kCantonese: 'yue',
  kJapanese: 'ja', kHangul: 'ko', kVietnamese: 'vi',
}
const rows = new Map<number, Record<string, string>>()
const row = (code: string) => {
  const point = parseInt(code.slice(2), 16)
  let found = rows.get(point)
  if (!found) rows.set(point, found = {})
  return found
}
for (const line of [read('Unihan_IRGSources.txt'), read('Unihan_Readings.txt')].join('\n').split('\n')) {
  const [code, field, value] = line.split('\t')
  const column = FIELDS[field]
  if (!column || !value) continue
  const text = value.trim()
  row(code)[column] = column === 'radical' ? /^\d+/.exec(text)?.[0] ?? '' : column === 'strokes' ? text.split(' ')[0]
    : column === 'ko' ? text.split(' ').map(item => item.split(':')[0]).join(' ') : text
}
for (const line of read('Unihan_Variants.txt').split('\n')) {
  const [code, field, value] = line.split('\t')
  if (!UNIHAN_VARIANTS.includes(field as never) || !value) continue
  const characters = [...new Set(value.trim().split(' ').map(item => String.fromCodePoint(parseInt(item.split('<')[0].slice(2), 16))))]
  const found = row(code)
  found.variants = [found.variants, ...characters.map(character => `${field}:${character}`)].filter(Boolean).join(' ')
}
if (rows.size < 90000) throw new Error(`only ${rows.size} rows`)
const blocks = new Map<string, string[]>()
for (const [point, found] of [...rows].sort((a, b) => a[0] - b[0])) {
  const block = (point >> 8).toString(16)
  const lines = blocks.get(block) ?? []
  lines.push([String.fromCodePoint(point), ...UNIHAN_COLUMNS.map(column => (found[column] ?? '').replace(/[\t\n]/g, ' '))].join('\t'))
  blocks.set(block, lines)
}
rmSync('static/unihan', { recursive: true, force: true })
mkdirSync('static/unihan', { recursive: true })
for (const [block, lines] of blocks) writeFileSync(`static/unihan/${block}.tsv`, lines.join('\n') + '\n')
console.log(`${rows.size} characters in ${blocks.size} files`)
