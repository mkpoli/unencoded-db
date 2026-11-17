// The other ways to spell the same form as a description: a part written out as the description BabelStone gives
// its character, or a run of parts folded back into the character that has that description.
// ⿺⿱𡗗夂面 and ⿺𡕤面 are one form. A part may also be swapped for one IWDS counts as the same component
// (夂 and 夊), since BabelStone and contributors spell such parts either way. Radical code points stay as typed.
import { groupKey, groupMates, hasOverlay, hasStroke, plain, typedTree, write, type Tree } from './similar'

export type Table = { encoded: ReadonlyMap<string, string>; described: ReadonlyMap<string, string> }
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
