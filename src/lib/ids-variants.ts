// The other ways to spell the same form as a description: a part written out as the description BabelStone gives
// its character, or a run of parts folded back into the character that has that description.
// ⿺⿱𡗗夂面 and ⿺𡕤面 are one form. A part may also be swapped for one IWDS counts as the same component
// (夂 and 夊), since BabelStone and contributors spell such parts either way. Radical code points stay as typed.
import { groupKey, groupMates, hasOverlay, hasStroke, plain, typedTree, write, type Tree } from './similar'
import { radicalEquivalent } from './radicals'

/** `all`, when the table has it, holds every description of a character, the first one first. */
export type Table = { encoded: ReadonlyMap<string, string>; described: ReadonlyMap<string, string>; all?: ReadonlyMap<string, readonly string[]> }
/** Spellings at most, the one typed included. */
export const SPELLINGS_MAX = 16

// What a leaf is written out as: its description when that is made of whole components, as `similar.ts` expands.
function wholeOf(leaf: string, table: Table): Tree | null {
  const description = table.described.get(leaf)
  const tree = description === undefined ? null : typedTree(description)
  return tree && typeof tree !== 'string' && !hasOverlay(tree) && !hasStroke(tree) ? tree : null
}

// A run of parts folds into the character whose description it matches with IWDS-equivalent parts counted
// as one (⿱𡗗夂 into 𡕤, described ⿱𡗗夊): Unicode encodes such a form once. Built once per table.
const loose = new WeakMap<Table, Map<string, string>>()
function looseEncoded(table: Table): Map<string, string> {
  let found = loose.get(table)
  if (found) return found
  found = new Map()
  for (const [description, char] of table.encoded) {
    const tree = typedTree(description)
    if (tree && typeof tree !== 'string') { const key = write(tree, groupKey); if (!found.has(key)) found.set(key, char) }
  }
  loose.set(table, found)
  return found
}

// The trees one step from a tree: one leaf written out or swapped for an IWDS mate, or one node folded into its character.
function steps(tree: Tree, table: Table, mates: boolean, root = true): Tree[] {
  if (typeof tree === 'string') {
    const inner = wholeOf(tree, table)
    return [...(inner ? [inner] : []), ...(mates ? groupMates(tree) : [])]
  }
  const found: Tree[] = []
  tree.parts.forEach((part, at) => {
    for (const next of steps(part, table, mates, false)) found.push({ op: tree.op, parts: tree.parts.map((other, i) => i === at ? next : other) })
  })
  const character = root ? undefined : table.encoded.get(write(tree)) ?? looseEncoded(table).get(write(tree, groupKey))
  if (character !== undefined) found.push(character)
  return found
}

/**
 * The spellings of a description that describe the same form, the typed one first, each once. Spellings are
 * found breadth-first, one step from those already found, and at most `limit` are returned.
 */
/** `mates: false` keeps to spellings of the very same form, leaving out IWDS swaps, which name a unifiable variant. */
export function equivalentSpellings(ids: string, table: Table, limit = SPELLINGS_MAX, mates = true): string[] {
  const start = plain(ids), tree = typedTree(start)
  if (!tree || typeof tree === 'string') return [start]
  const found = [start], seen = new Set(found)
  for (let at = 0; at < found.length && found.length < limit; at++) {
    const from = typedTree(found[at])
    if (!from) continue
    for (const next of steps(from, table, mates)) {
      const text = write(next)
      if (seen.has(text)) continue
      seen.add(text)
      found.push(text)
      if (found.length === limit) break
    }
  }
  return found
}

const leavesOf = (tree: Tree): string[] => typeof tree === 'string' ? [tree] : tree.parts.flatMap(leavesOf)
const JOINS: Record<number, string[]> = { 2: [...'⿰⿱⿴⿵⿶⿷⿸⿹⿺⿼⿽'], 3: [...'⿲⿳'] }
/** Runs of parts at most, the one typed included, and parts at most in a run: the search reads a row for each. */
export const PART_SPELLINGS_MAX = 4
export const PART_RUN_MAX = 5

/** Whether a text is parts alone: ideographs with no operator, space or other writing among them. */
export const isParts = (text: string) => /^[\p{Script=Han}\p{Co}\u31C0-\u31EF]+$/u.test(text)

const orders = (parts: string[]): string[][] => parts.length < 2 ? [parts] : parts.flatMap((part, at) => orders([...parts.slice(0, at), ...parts.slice(at + 1)]).map(rest => [part, ...rest]))

// The runs one step from a run: one part written out as the parts of its description, or two or three
// neighbouring parts folded into the character they describe, in any order.
function partSteps(run: readonly string[], table: Table): string[][] {
  const found: string[][] = []
  run.forEach((part, at) => {
    const inner = wholeOf(part, table)
    if (inner) found.push([...run.slice(0, at), ...leavesOf(inner), ...run.slice(at + 1)])
  })
  for (const size of [2, 3]) for (let at = 0; at + size <= run.length; at++) {
    const parts = run.slice(at, at + size)
    for (const order of orders(parts)) for (const op of JOINS[size]) {
      const tree: Tree = { op, parts: order }
      const character = table.encoded.get(write(tree)) ?? looseEncoded(table).get(write(tree, groupKey))
      if (character !== undefined) found.push([...run.slice(0, at), character, ...run.slice(at + size)])
    }
  }
  return found
}

// The parts a character is drawn from when its description goes down to strokes or overlays, which no
// spelling writes out: 水 is ㇇ and 𰛅. A component the table names by number alone ({24}) is left out, and
// a description with fewer than two parts left says nothing.
function drawnFrom(part: string, table: Table): string[][] {
  if (wholeOf(part, table)) return []
  // A description that takes strokes away (㇯上一) names what the character is not made of.
  const descriptions = (table.all?.get(part) ?? [table.described.get(part) ?? '']).filter(description => !description.includes('\u31EF'))
  const runs = descriptions.map(description => [...new Set([...description.replace(/\{\d+\}|#\([^)]*\)|&[^;]*;/gu, '')].filter(isParts).map(radicalEquivalent))])
  return runs.filter(run => run.length >= 2 && run.length <= PART_RUN_MAX && !run.includes(part))
}

/**
 * The runs of parts that may spell what a run of parts does, the typed one first: 艹時 is also 艹日寺 and 蒔.
 * Radical code points count as the ideographs they stand for, and a run with the same parts in another order is the same run.
 * A part typed twice is folded as two (木木 into 林) and written once, since a record is found by each part it holds.
 * A character typed alone that is drawn from strokes is also the run of those (水 is ㇇𰛅), which finds a description that writes it out.
 */
export function partSpellings(text: string, table: Table, limit = PART_SPELLINGS_MAX): string[] {
  const start = [...plain(text)].map(radicalEquivalent)
  const key = (run: readonly string[]) => [...new Set(run)].sort().join('')
  const found = [start], seen = new Set([key(start)])
  // Only a character typed alone: among other parts its strokes would find every record that holds a 一 or a 丨.
  if (start.length === 1) for (const run of drawnFrom(start[0], table)) {
    if (found.length === limit || seen.has(key(run))) continue
    seen.add(key(run))
    found.push(run)
  }
  for (let at = 0; at < found.length && found.length < limit; at++) {
    for (const stepped of partSteps(found[at], table)) {
      if (new Set(stepped).size > PART_RUN_MAX || stepped.length > PART_RUN_MAX * 2 || seen.has(key(stepped))) continue
      seen.add(key(stepped))
      found.push(stepped)
      if (found.length === limit) break
    }
  }
  return found.map(run => [...new Set(run)].join(''))
}

/**
 * The descriptions grouped by the form they name, in the order of each group's first description.
 * A description spelled another way is drawn once, by the first in its group.
 */
export function spellingGroups<T extends { ids: string }>(forms: readonly T[], table: Table, mates = false): T[][] {
  const parent = forms.map((_, index) => index)
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]))
  forms.forEach((form, index) => {
    const found = new Set(equivalentSpellings(form.ids, table, Math.max(SPELLINGS_MAX, forms.length), mates))
    for (let other = index + 1; other < forms.length; other++) if (found.has(forms[other].ids)) parent[find(other)] = find(index)
  })
  const groups = new Map<number, T[]>()
  forms.forEach((form, index) => {
    const root = find(index)
    const group = groups.get(root)
    if (group) group.push(form)
    else groups.set(root, [form])
  })
  return [...groups.values()]
}
