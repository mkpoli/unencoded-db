// How the parts of a description are moved from where the composer puts them. Each moved part is named
// by its place in the description (`1.0` is the first part of the second part, `` the whole) and holds
// the matrix it is drawn through, `[a, b, c, d, e, f]` as SVG writes one, in the part's own 1000-unit
// frame. A part the composer placed well has no entry, and a description nobody adjusted has no layout.
// A move belongs to its part: it stays while the description around the part changes, and goes when the
// part itself is replaced.
import { isNode, parse, write, type IdsPart } from 'ids-input'
import { GLYPH_STYLES, type GlyphStyle } from './composer'

export type Matrices = Record<string, number[]>
type FaceLayouts = Partial<Record<GlyphStyle, Matrices>>
export type Layout = Matrices | { shared?: Matrices; faces: FaceLayouts }

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

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function cleanMatrices(raw: unknown, ids: string): Matrices | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!record(value)) return null
  const tree = partsOf(ids)
  if (tree == null) return null
  const layout: Matrices = {}
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

// Missing styles inherit the old shared layout. An explicit empty map restores the composer's layout.
function combined(shared: Matrices | null, faces: FaceLayouts): Layout | null {
  const different: FaceLayouts = {}
  const base = JSON.stringify(shared ?? {})
  for (const style of GLYPH_STYLES) {
    const layout = faces[style]
    if (layout && JSON.stringify(layout) !== base) different[style] = layout
  }
  if (!Object.keys(different).length) return shared
  return { ...(shared && { shared }), faces: different }
}

/** Normalize a form or stored layout, in the order this app writes it. */
export function cleanLayout(raw: unknown, ids: string): Layout | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!record(value) || !record(value.faces)) return cleanMatrices(value, ids)
  const faces: FaceLayouts = {}
  for (const style of GLYPH_STYLES) {
    const layout = value.faces[style]
    if (record(layout)) faces[style] = cleanMatrices(layout, ids) ?? {}
  }
  return combined(cleanMatrices(value.shared, ids), faces)
}

const perFace = (layout: Layout): layout is { shared?: Matrices; faces: FaceLayouts } => 'faces' in layout

export function layoutForStyle(layout: Layout | null, style: GlyphStyle): Matrices | null {
  const found = layout && (perFace(layout) ? layout.faces[style] ?? layout.shared : layout)
  return found && Object.keys(found).length ? found : null
}

export function withStyleLayout(layout: Layout | null, style: GlyphStyle, change: Matrices | null): Layout | null {
  if (layout && perFace(layout)) return combined(layout.shared ?? null, { ...layout.faces, [style]: change ?? {} })
  return combined(layout, { [style]: change ?? {} })
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
  const carry = (matrices: Matrices | null | undefined) =>
    matrices ? cleanMatrices(Object.fromEntries(Object.entries(matrices).filter(([place]) => same(place))), to) : null
  if (!perFace(layout)) return carry(layout)
  const faces: FaceLayouts = {}
  for (const style of GLYPH_STYLES) {
    if (layout.faces[style]) faces[style] = carry(layout.faces[style]) ?? {}
  }
  return combined(carry(layout.shared), faces)
}

/** A layout as the text a form field and a database column hold. */
export const layoutText = (layout: Layout | null | undefined) => layout ? JSON.stringify(layout) : ''
