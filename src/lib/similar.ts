// Which descriptions are likely the same character as one being typed, in three tiers.
//   same     the same text (NFC, no spaces) as one of the candidate's descriptions;
//   probable equal once both are normalised (radical code points as the ideographs they stand for), their
//            parts with a BabelStone description made of whole components are expanded, or each part is its IWDS
//            group; a description with a placeholder (？, 〓, ①, ○) in it is never this or same;
//   similar  the same parts in another structure, the same structure with one part different, or mostly the same parts.
// BabelStone takes most characters down to strokes, so only a part built of components (no ⿻, no stroke) is
// expanded, until none is. Nothing here touches the network or the page, so it runs in the browser, on the server and in tests.
import { isNode, parse, type IdsPart } from 'ids-input'
import groupData from './data/component-groups.json'
import { radicalEquivalent } from './radicals'

export type Tier = 'same' | 'probable' | 'similar'
/** What expansion reads: each encoded character to its BabelStone description, atomic characters left out. */
export type Data = { described: ReadonlyMap<string, string> }
export type Tree = string | { op: string; parts: Tree[] }

/** Levels of expansion at most: parts are expanded until none is, and a table that loops stops here. */
export const EXPAND_DEPTH = 6
const STROKES = new Set([...'一丨丿丶乙亅乚𠃌⺄㇒'])
/** A stroke: a character of CJK Strokes (U+31C0–U+31EF) or one of the single-stroke ideographs. */
export const isStroke = (leaf: string) => STROKES.has(leaf) || /^[\u31C0-\u31EF]$/u.test(leaf)
/** Jaccard overlap of the grouped parts at which a description is similar. */
export const SIMILAR_MIN = 0.6
const REARRANGED = 0.9

const idOrder = (a: string, b: string) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || (a < b ? -1 : a > b ? 1 : 0)
const groupsOf = new Map<string, string[]>(Object.entries(groupData.groups as Record<string, string[]>).map(([part, ids]) => [part, [...ids].sort(idOrder)]))
let matesOf: Map<string, string[]> | null = null

/** The parts IWDS lists as one with this part, in no particular order. */
export function groupMates(part: string): string[] {
  if (!matesOf) {
    const members = new Map<string, string[]>()
    for (const [member, ids] of groupsOf) for (const id of ids) members.set(id, [...(members.get(id) ?? []), member])
    matesOf = new Map([...groupsOf].map(([member, ids]) => [member, [...new Set(ids.flatMap(id => members.get(id)!))].filter(other => other !== member)]))
  }
  return matesOf.get(part) ?? []
}

/** What a part counts as: the smallest group it is in, or itself. */
export const groupKey = (part: string) => { const first = groupsOf.get(part)?.[0]; return first === undefined ? part : `\u0001${first}` }

const mapRadicals = (text: string) => [...text.normalize('NFC').replace(/\s+/gu, '')].map(radicalEquivalent).join('')
const toTree = (part: IdsPart): Tree => typeof part === 'string' ? part : part === null || part === undefined ? '⬚' : { op: part.op, parts: part.parts.map(toTree) }

/** A description as a tree, radical code points as typed, or null when it is no description. */
export function typedTree(text: string): Tree | null {
  const found = parse(plain(text))
  return found.problem || found.tree === undefined ? null : toTree(found.tree)
}

/** A description as a tree with radical code points mapped, or null when it is no description. */
export const treeOf = (text: string): Tree | null => typedTree(mapRadicals(text))

export const hasOverlay = (tree: Tree): boolean => typeof tree !== 'string' && (tree.op === '⿻' || tree.parts.some(hasOverlay))
export const hasStroke = (tree: Tree): boolean => typeof tree === 'string' ? isStroke(tree) : tree.parts.some(hasStroke)
// What a description expands to, or null when it is not made of whole components.
const wholes = new Map<string, Tree | null>()
/** Forgets the expansions kept for the descriptions read so far; they are read again when needed. */
export const forgetExpansions = () => wholes.clear()
function wholeTree(description: string) {
  if (wholes.has(description)) return wholes.get(description)!
  const tree = treeOf(description)
  const whole = tree && !hasOverlay(tree) && !hasStroke(tree) ? tree : null
  wholes.set(description, whole)
  return whole
}

function expandTree(tree: Tree, data: Data, budget: number): Tree {
  if (typeof tree !== 'string') return { op: tree.op, parts: tree.parts.map(part => expandTree(part, data, budget)) }
  const described = budget > 0 ? data.described.get(tree) : undefined
  const inner = described ? wholeTree(described) : null
  return inner ? expandTree(inner, data, budget - 1) : tree
}

/** The tree of a description with every part that has a description replaced by it, or null for a text that is none. */
export function expand(ids: string, data: Data): Tree | null {
  const tree = treeOf(ids)
  return tree && expandTree(tree, data, EXPAND_DEPTH)
}

export const write = (tree: Tree, part: (leaf: string) => string = leaf => leaf): string => typeof tree === 'string' ? part(tree) : tree.op + tree.parts.map(inner => write(inner, part)).join('')
const leavesOf = (tree: Tree): string[] => typeof tree === 'string' ? [tree] : tree.parts.flatMap(leavesOf)

/** A description in its normal form: normalised, with every expandable part expanded. */
export function normalise(ids: string, data: Data): string {
  const tree = expand(ids, data)
  return tree === null ? mapRadicals(ids) : write(tree)
}

/** The parts of a description once expanded, in order. */
export function expandedLeaves(ids: string, data: Data): string[] {
  const tree = expand(ids, data)
  return tree === null ? [] : leavesOf(tree)
}

/** NFC with the spaces taken out: the text two descriptions must share to be the same. */
export const plain = (text: string) => text.normalize('NFC').replace(/\s+/gu, '')

// A part that names no character: a question mark, a box, a circled number, a circle. A letter, an ideograph
// (〇 included) or a private-use character is a part.
const PART = /^[\p{L}\p{M}\p{Nl}\p{Co}]/u
/** Whether a part is a placeholder for one that is unknown. */
export const isPlaceholder = (leaf: string) => !PART.test(leaf)

/** A description read once, for comparing with many. */
export type Prepared = { text: string; normal: string; grouped: string; shape: string; leaves: string[]; keys: string[]; counts: Map<string, number>; placeholder: boolean }

export function prepare(ids: string, data: Data): Prepared | null {
  const tree = expand(ids, data)
  if (!tree) return null
  const leaves = leavesOf(tree), keys = leaves.map(groupKey)
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return { text: plain(ids), normal: write(tree), grouped: write(tree, groupKey), shape: write(tree, () => '*'), leaves, keys, counts, placeholder: leaves.some(isPlaceholder) }
}

const sameCounts = (a: string[], b: string[]) => { const left = [...a].sort(), right = [...b].sort(); return left.length === right.length && left.every((leaf, i) => leaf === right[i]) }

function jaccard(a: Map<string, number>, b: Map<string, number>) {
  let both = 0, either = 0
  for (const key of new Set([...a.keys(), ...b.keys()])) { const x = a.get(key) ?? 0, y = b.get(key) ?? 0; both += Math.min(x, y); either += Math.max(x, y) }
  return either ? both / either : 0
}

export type Hit = { tier: Tier; score: number }
const RANK: Record<Tier, number> = { same: 0, probable: 1, similar: 2 }
/** The nearer of two hits: the better tier, then the higher score. */
export const nearer = (a: Hit | null, b: Hit | null) => !b || (a && (RANK[a.tier] - RANK[b.tier] || b.score - a.score) <= 0) ? a : b

function tierOne(q: Prepared, c: Prepared | null, text: string): Hit | null {
  const open = !q.placeholder
  if (open && q.text === text) return { tier: 'same', score: 1 }
  if (!c) return null
  if (open && (q.normal === c.normal || q.grouped === c.grouped)) return { tier: 'probable', score: 1 }
  if (sameCounts(q.leaves, c.leaves)) return { tier: 'similar', score: REARRANGED }
  const structured = q.shape !== '*' && q.shape === c.shape
  if (structured && q.keys.length === c.keys.length && q.keys.filter((key, i) => key !== c.keys[i]).length === 1) return { tier: 'similar', score: REARRANGED }
  const score = jaccard(q.counts, c.counts)
  return score >= SIMILAR_MIN ? { tier: 'similar', score } : null
}

/**
 * How a candidate relates to the description being typed, or null when it does not. A candidate is one
 * description or all of those it has, and takes its nearest. `score` orders a tier: 1 for the first two,
 * below for a similar one. A query with a placeholder in it is never same or probable.
 */
export function tierOf(query: string | Prepared, candidate: string | Prepared | readonly (string | Prepared)[], data: Data): Hit | null {
  const q = typeof query === 'string' ? prepare(query, data) : query
  if (!q) return null
  let best: Hit | null = null
  for (const own of Array.isArray(candidate) ? candidate : [candidate]) {
    const c = typeof own === 'string' ? prepare(own, data) : own
    best = nearer(best, tierOne(q, c, typeof own === 'string' ? plain(own) : own.text))
  }
  return best
}
