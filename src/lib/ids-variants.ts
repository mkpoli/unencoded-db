// The other ways to spell the same form as a description: a part written out as the description BabelStone gives
// its character, or a run of parts folded back into the character that has that description.
// ⿺⿱𡗗夂面 and ⿺𡕤面 are one form. Radical code points stay as typed.
import { hasOverlay, hasStroke, plain, typedTree, write, type Tree } from './similar'

export type Table = { encoded: ReadonlyMap<string, string>; described: ReadonlyMap<string, string> }
/** Spellings at most, the one typed included. */
export const SPELLINGS_MAX = 16

// What a leaf is written out as: its description when that is made of whole components, as `similar.ts` expands.
function wholeOf(leaf: string, table: Table): Tree | null {
  const description = table.described.get(leaf)
  const tree = description === undefined ? null : typedTree(description)
  return tree && typeof tree !== 'string' && !hasOverlay(tree) && !hasStroke(tree) ? tree : null
}

// The trees one step from a tree: one leaf written out, or one node folded into its character.
function steps(tree: Tree, table: Table, root = true): Tree[] {
  if (typeof tree === 'string') {
    const inner = wholeOf(tree, table)
    return inner ? [inner] : []
  }
  const found: Tree[] = []
  tree.parts.forEach((part, at) => {
    for (const next of steps(part, table, false)) found.push({ op: tree.op, parts: tree.parts.map((other, i) => i === at ? next : other) })
  })
  const character = root ? undefined : table.encoded.get(write(tree))
  if (character !== undefined) found.push(character)
  return found
}

/**
 * The spellings of a description that describe the same form, the typed one first, each once. Spellings are
 * found breadth-first, one step from those already found, and at most `limit` are returned.
 */
export function equivalentSpellings(ids: string, table: Table, limit = SPELLINGS_MAX): string[] {
  const start = plain(ids), tree = typedTree(start)
  if (!tree || typeof tree === 'string') return [start]
  const found = [start], seen = new Set(found)
  for (let at = 0; at < found.length && found.length < limit; at++) {
    const from = typedTree(found[at])
    if (!from) continue
    for (const next of steps(from, table)) {
      const text = write(next)
      if (seen.has(text)) continue
      seen.add(text)
      found.push(text)
      if (found.length === limit) break
    }
  }
  return found
}
