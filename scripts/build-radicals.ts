// Writes src/lib/radical-tables.ts: what src/lib/radicals.ts needs to file a description under a radical.
//
//   bun scripts/build-radicals.ts <Unihan.zip> <EquivalentUnifiedIdeograph.txt>
//
// <Unihan.zip> is https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip
// (sha256 4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e) and
// <EquivalentUnifiedIdeograph.txt> is https://www.unicode.org/Public/18.0.0/ucd/EquivalentUnifiedIdeograph.txt
// (sha256 c86c80f6a0d1d47c9a5aadfbf1c26f1a732d662d9ccb0ed2d397919ecc47bf72). The descriptions are
// BabelStone's, as ids-input carries them. It needs `unzip`.
//
// Unihan's kRSUnicode names the radical of every encoded ideograph. The part of a description that holds
// that radical is the character's head. Counting, for every part and every place in a description, how
// often it is the head gives the weights that choose the head of a description with no code.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { isNode, parse, type IdsPart } from 'ids-input'
import { radicalCharacter } from '../src/lib/character-tables'

const [zip, equivalentFile] = process.argv.slice(2)
if (!zip || !equivalentFile) throw new Error('usage: bun scripts/build-radicals.ts <Unihan.zip> <EquivalentUnifiedIdeograph.txt>')
const root = join(import.meta.dir, '..')

// The radical of each ideograph and the strokes it adds to it: none for a form of the radical itself.
const filed = new Map<string, { radical: number; rest: number }>()
const strokes = new Map<string, number>()
for (const line of new TextDecoder().decode(Bun.spawnSync(['unzip', '-p', zip, 'Unihan_IRGSources.txt']).stdout).split('\n')) {
  const [code, field, value] = line.split('\t')
  if (field === 'kTotalStrokes' && value) strokes.set(String.fromCodePoint(parseInt(code.slice(2), 16)), Number(value.trim().split(' ')[0]))
  const found = field === 'kRSUnicode' && value ? /^(\d+)'*\.(-?\d+)/.exec(value.trim()) : null
  if (found) filed.set(String.fromCodePoint(parseInt(code.slice(2), 16)), { radical: Number(found[1]), rest: Number(found[2]) })
}
if (filed.size < 90000) throw new Error(`only ${filed.size} characters with a radical`)
const isForm = (char: string, radical: number) => { const found = filed.get(char); return found?.radical === radical && found.rest === 0 }

// A radical or stroke character to the ideograph it stands for, where that ideograph has a radical.
const equivalents: [string, string][] = []
for (const line of readFileSync(equivalentFile, 'utf8').split('\n')) {
  const found = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([0-9A-F]+)/.exec(line)
  if (!found) continue
  const to = String.fromCodePoint(parseInt(found[3], 16))
  if (!filed.has(to)) continue
  for (let point = parseInt(found[1], 16); point <= parseInt(found[2] ?? found[1], 16); point++) if (!filed.has(String.fromCodePoint(point))) equivalents.push([String.fromCodePoint(point), to])
}

const unwrap = (part: IdsPart): IdsPart => { while (isNode(part) && part.parts.length === 1) part = part.parts[0] ?? null; return part }
const described = new Map<string, IdsPart>()
for (const line of gunzipSync(readFileSync(join(root, 'node_modules/ids-input/data/babelstone-ids.tsv.gz'))).toString('utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue
  const [char, sequences] = line.split('\t')
  const first = sequences?.split(' ')[0]?.replace(/\([^)]*\)$/, '').replace(/^〾/, '')
  if (!filed.has(char) || !first || first === char) continue
  const parsed = parse(first, { open: true })
  if (!parsed.problem && parsed.tree !== undefined) described.set(char, unwrap(parsed.tree))
}
if (described.size < 90000) throw new Error(`only ${described.size} descriptions`)

// How deep a form of the radical sits inside a part, or Infinity when the part holds none.
const depths = new Map<string, number>()
function depthOf(part: IdsPart, radical: number, seen = new Set<string>()): number {
  part = unwrap(part)
  if (part === null || part === undefined) return Infinity
  if (isNode(part)) return 1 + Math.min(...part.parts.map(inner => depthOf(inner, radical, seen)))
  if (isForm(part, radical)) return 0
  const key = `${part}${radical}`
  const known = depths.get(key)
  if (known !== undefined) return known
  if (seen.has(part)) return Infinity
  seen.add(part)
  const tree = described.get(part)
  const depth = tree === undefined ? Infinity : depthOf(tree, radical, seen)
  seen.delete(part)
  depths.set(key, depth)
  return depth
}
// The place of the part that holds the radical nearest the surface, the first of them when several do.
function headOf(parts: readonly IdsPart[], radical: number) {
  const found = parts.map(part => depthOf(part, radical))
  const nearest = Math.min(...found)
  return nearest === Infinity ? null : found.indexOf(nearest)
}

const prior = new Map<string, number[]>()
const heads = new Map<string, Map<string, [head: number, seen: number]>>()
for (const [char, tree] of described) {
  if (!isNode(tree)) continue
  const head = headOf(tree.parts, filed.get(char)!.radical)
  if (head === null) continue
  const shape = `${tree.op}${tree.parts.length}`
  const places = prior.get(shape) ?? tree.parts.map(() => 0)
  places[head]++
  prior.set(shape, places)
  tree.parts.forEach((inner, index) => {
    const part = unwrap(inner)
    if (typeof part !== 'string' || [...part].length !== 1) return
    const slots = heads.get(part) ?? new Map<string, [number, number]>()
    const slot = `${shape}.${index}`
    const count = slots.get(slot) ?? [0, 0]
    count[1]++
    if (index === head) count[0]++
    slots.set(slot, count)
    heads.set(part, slots)
  })
}

// The characters between a character's radical and itself: each is the part of the next that holds the radical.
function between(char: string, radical: number, seen = new Set<string>()): string[] {
  if (seen.has(char)) return []
  seen.add(char)
  let tree = described.get(char)
  while (isNode(tree)) {
    const head = headOf(tree.parts, radical)
    if (head === null) return []
    tree = unwrap(tree.parts[head])
  }
  return typeof tree !== 'string' || isForm(tree, radical) ? [] : [...between(tree, radical, seen), tree]
}
const via: string[] = []
for (const [char, { radical, rest }] of filed) {
  const inner = rest === 0 ? [] : between(char, radical)
  if (inner.length) via.push(char + inner.join(''))
}

const points = [...filed].map(([char, found]) => [char.codePointAt(0)!, found.radical] as const).sort((a, b) => a[0] - b[0])
const runs: [start: number, length: number, radical: number][] = []
for (const [point, radical] of points) {
  const last = runs.at(-1)
  if (last && last[2] === radical && last[0] + last[1] === point) last[1]++
  else runs.push([point, 1, radical])
}
const forms = [...filed].filter(([, found]) => found.rest === 0).map(([char]) => char)
const radicals = Array.from({ length: 214 }, (_, index) => radicalCharacter(index + 1)!)
for (const radical of radicals) if (!isForm(radical, radicals.indexOf(radical) + 1) || !strokes.get(radical)) throw new Error(`${radical} is not a form of its radical, or has no stroke count`)
// The radicals are in order of stroke count. Where Unihan counts a radical's ideograph with fewer strokes
// than the radical before it, the radical keeps the count of its place in the order.
const counted: number[] = []
const raised: string[] = []
for (const radical of radicals) {
  const own = strokes.get(radical)!, before = counted.at(-1) ?? 0
  if (own < before) raised.push(`${radical} ${own}→${before}`)
  counted.push(Math.max(own, before))
}

const lines = (items: string[], each: number) => Array.from({ length: Math.ceil(items.length / each) }, (_, index) => `  ${JSON.stringify(items.slice(index * each, (index + 1) * each).join(' '))},`).join('\n')
writeFileSync(join(root, 'src/lib/radical-tables.ts'), `// Written by scripts/build-radicals.ts from kRSUnicode and kTotalStrokes of Unihan 18.0.0 and EquivalentUnifiedIdeograph-18.0.0.txt
// (Copyright Unicode, Inc., Unicode License v3) and BabelStone's IDS table as ids-input carries it.

/** The 214 Kangxi radicals in order, each as the ideograph it unifies with. */
export const RADICALS = ${JSON.stringify(radicals.join(''))}

/** The stroke count of each Kangxi radical, in the same order. */
export const RADICAL_STROKES = ${JSON.stringify(counted.join(' '))}

/** Runs of code points filed under one radical: the first code point and the length in base 36, then the radical's number. */
export const RADICAL_RUNS = [
${lines(runs.map(([start, length, radical]) => `${start.toString(36)}:${length.toString(36)}:${radical}`), 200)}
].join(' ')

/** The characters that are a form of their own radical. */
export const RADICAL_FORMS = ${JSON.stringify(forms.join(''))}

/** A radical or stroke character, then the ideograph it stands for. */
export const RADICAL_EQUIVALENTS = ${JSON.stringify(equivalents.map(pair => pair.join('')).join(' '))}

/** A character, then the characters between its radical and itself, outermost last. */
export const RADICAL_VIA = [
${lines(via, 400)}
].join(' ')

/** For each shape of description, how often each place holds the radical. */
export const HEAD_PRIOR = ${JSON.stringify([...prior].map(([shape, places]) => `${shape}=${places.join(',')}`).join(' '))}

/** A part, then for each place it takes (shape.place) how often it holds the radical there, of how often it is there. */
export const HEAD_COUNTS = [
${lines([...heads].map(([part, slots]) => part + [...slots].map(([slot, [head, seen]]) => `${slot}=${head}/${seen}`).join(';')), 200)}
].join(' ')
`)
if (raised.length) console.log(`stroke counts raised to keep the order: ${raised.join(', ')}`)
console.log(`${filed.size} characters in ${runs.length} runs, ${forms.length} forms, ${via.length} with characters between, ${heads.size} parts`)
