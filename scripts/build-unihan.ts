// Writes src/lib/data/unihan-rs.tsv.gz: the radical and total stroke count Unihan gives each ideograph.
//
//   bun scripts/build-unihan.ts <Unihan.zip>
//
// <Unihan.zip> is https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip
// (sha256 4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e). Each line of the output is
// `character<TAB>radical number<TAB>strokes`, from the first value of kRSUnicode and of kTotalStrokes.
// It needs `unzip`.
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const [zip] = process.argv.slice(2)
if (!zip) throw new Error('usage: bun scripts/build-unihan.ts <Unihan.zip>')
const text = new TextDecoder().decode(Bun.spawnSync(['unzip', '-p', zip, 'Unihan_IRGSources.txt']).stdout)
const rows = new Map<number, { radical?: string; strokes?: string }>()
for (const line of text.split('\n')) {
  const [code, field, value] = line.split('\t')
  if ((field !== 'kRSUnicode' && field !== 'kTotalStrokes') || !value) continue
  const point = parseInt(code.slice(2), 16)
  const row = rows.get(point) ?? {}
  const first = value.trim().split(' ')[0]
  if (field === 'kRSUnicode') row.radical = /^\d+/.exec(first)?.[0]
  else row.strokes = first
  rows.set(point, row)
}
const lines = [...rows].sort((a, b) => a[0] - b[0]).filter(([, row]) => row.radical || row.strokes)
  .map(([point, row]) => `${String.fromCodePoint(point)}\t${row.radical ?? ''}\t${row.strokes ?? ''}`)
if (lines.length < 90000) throw new Error(`only ${lines.length} rows`)
writeFileSync('src/lib/data/unihan-rs.tsv.gz', gzipSync(lines.join('\n') + '\n', { level: 9 }))
console.log(`${lines.length} characters`)
