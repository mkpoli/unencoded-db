// Writes src/lib/unicode-age.ts: the version of Unicode that first assigned each code point of the
// ideograph blocks, as runs of code points that share a version.
//
//   bun scripts/build-unicode-age.ts <DerivedAge.txt>
//
// <DerivedAge.txt> is https://www.unicode.org/Public/18.0.0/ucd/DerivedAge.txt
// (sha256 58b04334e3a31f9612694bbc3f6bff4a302b7d424565bca9c47e30aa74f8dbac).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IDEOGRAPHS } from '../src/lib/registries'

const [file] = process.argv.slice(2)
if (!file) throw new Error('usage: bun scripts/build-unicode-age.ts <DerivedAge.txt>')
const runs: [number, number, string][] = []
for (const line of readFileSync(file, 'utf8').split('\n')) {
  const found = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([\d.]+)/.exec(line)
  if (!found) continue
  const from = parseInt(found[1], 16), to = parseInt(found[2] ?? found[1], 16)
  for (const [first, last] of IDEOGRAPHS) if (from <= last && to >= first) runs.push([Math.max(from, first), Math.min(to, last), found[3]])
}
runs.sort((a, b) => a[0] - b[0])
const merged: [number, number, string][] = []
for (const run of runs) {
  const last = merged.at(-1)
  if (last && last[2] === run[2] && last[1] + 1 === run[0]) last[1] = run[1]
  else merged.push([...run])
}
const hex = (point: number) => `0x${point.toString(16).toUpperCase()}`
writeFileSync(join(import.meta.dir, '../src/lib/unicode-age.ts'), `// Written by scripts/build-unicode-age.ts from DerivedAge-18.0.0.txt (Copyright Unicode, Inc., Unicode License v3):
// the version of Unicode that first assigned each code point of the ideograph blocks.
export const UNICODE_AGES: readonly (readonly [from: number, to: number, version: string])[] = [
${merged.map(([from, to, version]) => `  [${hex(from)}, ${hex(to)}, '${version}'],`).join('\n')}
]
`)
