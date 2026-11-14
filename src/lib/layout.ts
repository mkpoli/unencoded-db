// How the parts of a description are moved from where the composer puts them. Each moved part is named
// by its place in the description (`1.0` is the first part of the second part, `` the whole) and holds
// the matrix it is drawn through, `[a, b, c, d, e, f]` as SVG writes one, in the part's own 1000-unit
// frame. A part the composer placed well has no entry, and a description nobody adjusted has no layout.
// A move belongs to its part: it stays while the description around the part changes, and goes when the
// part itself is replaced.
import { isNode, parse, write, type IdsPart } from 'ids-input'

export type Layout = Record<string, number[]>

export const LAYOUT_PARTS_MAX = 64
const STEP = '(?:0|[1-9]\\d?)'
const PLACE = new RegExp(`^(?:${STEP}(?:\\.${STEP})*)?$`)
const REACH = 100000
const IDENTITY = [1, 0, 0, 1, 0, 0]
const round = (value: number) => Math.round(value * 1e4) / 1e4

export const placeOf = (path: readonly number[]) => path.join('.')
export const pathOf = (place: string) => place ? place.split('.').map(Number) : []

function partAt(tree: IdsPart, path: readonly number[]): IdsPart | undefined {
  let part: IdsPart | undefined = tree
  for (const step of path) {
    if (!isNode(part)) return undefined
    part = part.parts[step]
  }
  return part
}
// A description that is still being built has parts too; its empty places are none.
const partsOf = (ids: string) => ids ? parse(ids, { open: true }).tree : undefined

/**
 * The layout a form or a stored claim states for `ids`, as this app writes it: places in order, matrices
 * rounded. A place the description does not have, a part left where it was and a matrix that cannot draw
 * are left out; null when nothing is left.
 */
export function cleanLayout(raw: unknown, ids: string): Layout | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const tree = partsOf(ids)
  if (tree == null) return null
  const layout: Layout = {}
  for (const [place, matrix] of Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, LAYOUT_PARTS_MAX)) {
    if (!PLACE.test(place) || partAt(tree, pathOf(place)) == null) continue
    if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(item => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= REACH)) continue
    const rounded = matrix.map(round)
    const [a, b, c, d] = rounded
    if (Math.abs(a * d - b * c) < 1e-6) continue
    if (rounded.some((item, index) => item !== IDENTITY[index])) layout[place] = rounded
  }
  return Object.keys(layout).length ? layout : null
}

/** Whether a stored layout is one this app writes for `ids`. */
export const validLayout = (layout: unknown, ids: string) => {
  const clean = cleanLayout(layout, ids)
  return clean !== null && JSON.stringify(clean) === JSON.stringify(layout)
}

/**
 * What a layout of `from` keeps when the description becomes `to`: the moves of the parts that are the
 * same part at the same place in both. A part that was replaced, or whose own parts changed, starts
 * where the composer puts it.
 */
export function carryLayout(layout: Layout | null, from: string, to: string): Layout | null {
  if (!layout) return null
  if (from === to) return cleanLayout(layout, to)
  const before = partsOf(from), after = partsOf(to)
  if (before == null || after == null) return null
  const same = (place: string) => {
    const old = partAt(before, pathOf(place)), now = partAt(after, pathOf(place))
    return old != null && now != null && write(old) === write(now)
  }
  return cleanLayout(Object.fromEntries(Object.entries(layout).filter(([place]) => same(place))), to)
}

/** A layout as the text a form field and a database column hold. */
export const layoutText = (layout: Layout | null | undefined) => layout ? JSON.stringify(layout) : ''
