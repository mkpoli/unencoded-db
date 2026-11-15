// The radical a record is filed under, read from its first description. The head of a description is
// the part that holds its radical: the weights in radical-tables.ts, counted over the encoded ideographs
// whose radical Unihan names, choose it. The path runs from a Kangxi radical through each character on
// the way to the head, so ⿺克卡 is filed 儿兄克. A path is a radical of its own once enough records
// stay in it, or once a record states it as its radical; until then its records are filed under the
// path above. A stated character that has no Kangxi radical is a radical outside the Kangxi set.
import { isNode, parse, type IdsPart } from 'ids-input'
import { splitIds } from './ids'
import { HEAD_COUNTS, HEAD_PRIOR, RADICALS, RADICAL_EQUIVALENTS, RADICAL_FORMS, RADICAL_RUNS, RADICAL_STROKES, RADICAL_VIA } from './radical-tables'

/** The records a path must keep to stand as a radical of its own. Proposed by NGWU YOH (chat messages, 2026-11-06 and 2026-11-08, unpublished). */
export const BRANCH_MIN = 10
export const PATH_MAX = 8

type Count = [head: number, seen: number]
type Tables = {
  runs: [start: number, length: number, radical: number][]
  forms: Set<string>
  equivalents: Map<string, string>
  via: Map<string, string[]>
  prior: Map<string, number[]>
  slots: Map<string, Count>
  parts: Map<string, Count>
}
let loaded: Tables | null = null
const kangxi = [...RADICALS]
/** The 214 Kangxi radicals in order. */
export const KANGXI: readonly string[] = kangxi
const kangxiStrokes = RADICAL_STROKES.split(' ').map(Number)
/** The stroke count of a Kangxi radical, or null for a radical outside the set. */
export const radicalStrokes = (radical: string) => kangxiStrokes[kangxi.indexOf(radical)] ?? null

function tables(): Tables {
  if (loaded) return loaded
  const slots = new Map<string, Count>(), parts = new Map<string, Count>()
  for (const item of HEAD_COUNTS.split(' ')) {
    const part = String.fromCodePoint(item.codePointAt(0)!)
    const total: Count = [0, 0]
    for (const slot of item.slice(part.length).split(';')) {
      const [place, count] = slot.split('=')
      const [head, seen] = count.split('/').map(Number)
      slots.set(part + place, [head, seen])
      total[0] += head; total[1] += seen
    }
    parts.set(part, total)
  }
  return loaded = {
    runs: RADICAL_RUNS.split(' ').map(run => { const [start, length, radical] = run.split(':'); return [parseInt(start, 36), parseInt(length, 36), Number(radical)] }),
    forms: new Set(RADICAL_FORMS),
    equivalents: new Map(RADICAL_EQUIVALENTS.split(' ').map(pair => [...pair] as [string, string])),
    via: new Map(RADICAL_VIA.split(' ').map(item => { const [char, ...between] = [...item]; return [char, between] })),
    prior: new Map(HEAD_PRIOR.split(' ').map(item => { const [shape, places] = item.split('='); return [shape, places.split(',').map(Number)] })),
    slots, parts,
  }
}

// A variation selector picks a glyph of the character before it and leaves its radical alone.
const bare = (text: string) => text.replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '')

function radicalOf(char: string) {
  const { runs } = tables(), point = char.codePointAt(0)!
  let low = 0, high = runs.length - 1
  while (low < high) { const middle = (low + high + 1) >> 1; if (runs[middle][0] <= point) low = middle; else high = middle - 1 }
  const [start, length, radical] = runs[low]
  return point >= start && point < start + length ? radical : null
}

/** The path of an encoded character: its Kangxi radical, the characters between, and the character itself unless it is a form of the radical. */
function pathOf(written: string): string[] | null {
  const text = bare(written)
  if ([...text].length !== 1) return null
  const found = tables()
  const char = found.equivalents.get(text) ?? text
  const radical = radicalOf(char)
  if (radical === null) return null
  return found.forms.has(char) ? [kangxi[radical - 1]] : [kangxi[radical - 1], ...(found.via.get(char) ?? []), char]
}

const unwrap = (part: IdsPart): IdsPart => { while (isNode(part) && part.parts.length === 1) part = part.parts[0] ?? null; return part }
// How much the counts lean on what the shape alone says, for a part seen seldom.
const LEAN = 2

/** How likely each part is to hold the radical: by its place in the shape, corrected by how often the part itself does. */
function weigh(op: string, parts: readonly IdsPart[]) {
  const found = tables(), shape = `${op}${parts.length}`
  const places = found.prior.get(shape), total = places?.reduce((sum, n) => sum + n, 0) ?? 0
  return parts.map((inner, index) => {
    const byPlace = places && total ? (places[index] + 0.5) / (total + 0.5 * parts.length) : 1 / parts.length
    const whole = unwrap(inner)
    if (typeof whole !== 'string') return byPlace
    const part = bare(whole)
    const [head, seen] = found.parts.get(part) ?? [0, 0]
    const byPart = (head + LEAN * byPlace) / (seen + LEAN)
    const [headHere, seenHere] = found.slots.get(`${part}${shape}.${index}`) ?? [0, 0]
    return (headHere + LEAN * byPart) / (seenHere + LEAN)
  })
}

function detect(inner: IdsPart, whole = false): string[] | null {
  const part = unwrap(inner)
  if (part === null || part === undefined) return null
  if (!isNode(part)) {
    const path = pathOf(part)
    // A record that is one encoded character is filed with that character's radical, not under itself.
    return path && whole && path.length > 1 ? path.slice(0, -1) : path
  }
  const weights = weigh(part.op, part.parts)
  const order = weights.map((_, index) => index).sort((a, b) => weights[b] - weights[a])
  for (const index of order) {
    const found = detect(part.parts[index])
    if (found) return found
  }
  return null
}

// What can be a radical outside the Kangxi set: one character of a script without case, or a symbol such as a stroke.
const CUSTOM = /^[\p{Lo}\p{So}]$/u
const isCustom = (text: string) => CUSTOM.test(text) && pathOf(text) === null

/** The path a stated radical names: that of an ideograph, or a character outside the Kangxi set on its own. */
function statedPath(stated: string | null | undefined) {
  const text = bare((stated ?? '').normalize('NFC').trim().replace(/(?<=.)部$/u, ''))
  return pathOf(text) ?? (isCustom(text) ? [text] : null)
}

/** Where a record is filed: its path from the radical down, and the path its stated radical names. */
export type Filing = { path: string[]; stated: string | null }

/**
 * Where a record is filed, or null when it states no radical and its description names no part with
 * one. A radical the record states stands, unless the description leads further down the same path.
 */
export function fileRecord(ids: string | null | undefined, stated?: string | null): Filing | null {
  const sequence = splitIds(ids)[0]
  const parsed = sequence ? parse(sequence, { open: true }) : null
  const detected = parsed && !parsed.problem && parsed.tree !== undefined ? detect(parsed.tree, true) : null
  const named = statedPath(stated)
  const path = named && !(detected && named.every((char, index) => detected[index] === char)) ? named : detected
  return path ? { path: path.slice(0, PATH_MAX), stated: named?.join('') ?? null } : null
}

/** The path a record is filed under, as its characters from the radical down. */
export const radicalPath = (ids: string | null | undefined, stated?: string | null) => fileRecord(ids, stated)?.path ?? null

/** Every path a record is listed under: its own and each one above it. */
export const pathsOf = (path: readonly string[]) => path.map((_, index) => path.slice(0, index + 1).join(''))

/** A path as a list address names it, or null for a text that is none. */
export function parsePath(text: string | null | undefined) {
  const path = (text ?? '').normalize('NFC')
  const chars = [...path]
  return (chars.length >= 1 && chars.length <= PATH_MAX && kangxi.includes(chars[0]) && chars.every(char => radicalOf(char) !== null)) || isCustom(path) ? path : null
}

export type Branch = { path: string; radical: string; records: number; branches: Branch[] }

/**
 * The radicals that stand, given the records each path holds and the paths records state: every radical
 * in use, each stated path, and each longer path that keeps `BRANCH_MIN` records once the branches
 * standing under it are taken out. The Kangxi radicals come in order and the others after them, each
 * with the branches under it, the fullest first.
 */
export function standing(counts: ReadonlyMap<string, number>, stated: ReadonlySet<string> = new Set()): Branch[] {
  const paths = [...counts.keys()].map(path => [...path]).sort((a, b) => b.length - a.length)
  const kept = new Map(counts)
  const found = new Map<string, Branch>()
  for (const chars of paths) {
    const path = chars.join(''), own = kept.get(path) ?? 0
    if (chars.length > 1 && own < BRANCH_MIN && !stated.has(path)) continue
    if (chars.length === 1 && !(counts.get(path)! > 0)) continue
    found.set(path, { path, radical: chars.at(-1)!, records: counts.get(path)!, branches: [] })
    for (let length = chars.length - 1; length >= 1; length--) { const above = chars.slice(0, length).join(''); kept.set(above, (kept.get(above) ?? 0) - own) }
  }
  const roots: Branch[] = []
  for (const branch of [...found.values()].sort((a, b) => [...a.path].length - [...b.path].length)) {
    const chars = [...branch.path]
    let above: Branch | undefined
    for (let length = chars.length - 1; length >= 1 && !above; length--) above = found.get(chars.slice(0, length).join(''))
    ;(above?.branches ?? roots).push(branch)
  }
  const sort = (branches: Branch[]) => { branches.sort((a, b) => b.records - a.records || a.path.localeCompare(b.path)); branches.forEach(branch => sort(branch.branches)) }
  roots.forEach(root => sort(root.branches))
  const place = (path: string) => kangxi.includes(path) ? kangxi.indexOf(path) : kangxi.length
  return roots.sort((a, b) => place(a.path) - place(b.path) || a.path.localeCompare(b.path))
}

/** The standing radicals a path runs through, from the Kangxi radical down. */
export function filedUnder(path: readonly string[], counts: ReadonlyMap<string, number>, stated: ReadonlySet<string> = new Set()): Branch[] {
  const own = pathsOf(path)
  const out: Branch[] = []
  let level = standing(counts, stated)
  for (;;) {
    const next = level.find(branch => own.includes(branch.path))
    if (!next) return out
    out.push(next)
    level = next.branches
  }
}
