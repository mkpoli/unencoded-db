// How the parts of a description are moved from where the composer puts them. Each moved part is named
// by its place in the description (`1.0` is the first part of the second part, `` the whole) and holds
// the matrix it is drawn through, `[a, b, c, d, e, f]` as SVG writes one, in the part's own 1000-unit
// frame. A part the composer placed well has no entry, and a description nobody adjusted has no layout.
import { isNode, parse, type IdsPart } from 'ids-input'

export type Layout = Record<string, number[]>

export const LAYOUT_PARTS_MAX = 64
const PLACE = /^(?:\d{1,2}(?:\.\d{1,2})*)?$/
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

/**
 * The layout a form or a stored claim states for `ids`, as this app writes it: places in order, matrices
 * rounded, parts left where they were taken out. Null when nothing is moved or the value is not a layout
 * of this description.
 */
export function cleanLayout(raw: unknown, ids: string): Layout | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (!entries.length || entries.length > LAYOUT_PARTS_MAX) return null
  const tree = parse(ids).tree
  if (tree === undefined) return null
  const layout: Layout = {}
  for (const [place, matrix] of entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!PLACE.test(place) || partAt(tree, pathOf(place)) == null) return null
    if (!Array.isArray(matrix) || matrix.length !== 6 || !matrix.every(item => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= REACH)) return null
    const [a, b, c, d] = matrix
    if (Math.abs(a * d - b * c) < 1e-6) return null
    const rounded = matrix.map(round)
    if (rounded.some((item, index) => item !== IDENTITY[index])) layout[place] = rounded
  }
  return Object.keys(layout).length ? layout : null
}

/** Whether a stored layout is one this app writes for `ids`. */
export const validLayout = (layout: unknown, ids: string) => {
  const clean = cleanLayout(layout, ids)
  return clean !== null && JSON.stringify(clean) === JSON.stringify(layout)
}

/** A layout as the text a form field and a database column hold. */
export const layoutText = (layout: Layout | null | undefined) => layout ? JSON.stringify(layout) : ''
