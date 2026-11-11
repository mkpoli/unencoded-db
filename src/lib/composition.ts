// The parts an editor tags for a record's first description, the role each part plays, and the
// formation those roles imply. The parsed parts are a starting point: an editor may replace them,
// type a role outside the standard three, and name a formation the roles cannot express.
import { isNode, parse, write, type IdsPart } from 'ids-input'
import { IDS_LENGTH_MAX, splitIds } from './ids'

export const ROLES = ['semantic', 'phonetic', 'symbol'] as const
export type Role = (typeof ROLES)[number]

export const FORMATIONS = ['phonoSemantic', 'ideographic', 'indicative', 'sign', 'single', 'unknown'] as const
export type Formation = (typeof FORMATIONS)[number]

export const PARTS_MAX = 8
export const PART_MAX = 20
export const ROLE_MAX = 40
export const FORMATION_MAX = 40

/** One part and the role given to it. The role is a standard code or an editor's own text. */
export type PartRole = { part: string; role: string }

/**
 * What a record stores for its first description. `parts` is absent in records tagged before parts
 * could be edited; the parts parsed from the description stand in for it.
 */
export type Composition = {
  ids: string
  parts?: string[]
  roles: string[]
  formation: string | null
}

/** The parts tagged for a description, the standard formation they imply, and the one shown. */
export type Analysis = {
  ids: string
  parts: PartRole[]
  /** The standard formation the standard roles imply, or null when a role is custom or missing. */
  derived: Formation | null
  /** What the record shows: an editor's override, the derived formation, or `single`/`unknown`. */
  formation: string
  /** Whether a stored analysis gives the description roles or a formation. */
  tagged: boolean
}

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.normalize('NFC').trim().slice(0, max) : ''

function cleanList(value: unknown, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, PARTS_MAX).map(item => clean(item, max))
}

/** A stored composition, or null when the value is not one this app writes. */
export function parseComposition(value: unknown): Composition | null {
  if (typeof value !== 'string' || !value) return null
  let data: unknown
  try { data = JSON.parse(value) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const stored = data as { ids?: unknown; parts?: unknown; roles?: unknown; formation?: unknown }
  const ids = clean(stored.ids, IDS_LENGTH_MAX)
  if (!ids) return null
  const roles = cleanList(stored.roles, ROLE_MAX) ?? []
  const parts = cleanList(stored.parts, PART_MAX)
  const formation = clean(stored.formation, FORMATION_MAX) || null
  if (parts) {
    // Parts and roles belong to one list; an empty part takes its role with it.
    const rows = parts
      .map((part, index) => ({ part, role: roles[index] ?? '' }))
      .filter(row => row.part)
    if (!rows.length && !formation) return null
    return { ids, parts: rows.map(row => row.part), roles: rows.map(row => row.role), formation }
  }
  // A record tagged before parts could be edited stores the roles alone.
  if (!roles.some(Boolean) && !formation) return null
  return { ids, roles, formation }
}

/** The JSON a form carries, or an empty string when it carries no analysis. */
export function composeValue(ids: string, parts: readonly string[], roles: readonly string[], formation: string | null): string {
  return parts.length || formation ? JSON.stringify({ ids, parts, roles, formation }) : ''
}

/**
 * The standard formation the roles imply, or null while a role is custom, missing, or the only part.
 * A symbol beside a semantic part marks a 指事; symbols on their own make a 記號. A part that is
 * both semantic and phonetic (亦聲) is outside the three roles.
 */
export function formationOf(roles: readonly string[]): Formation | null {
  const has = (role: Role) => roles.includes(role)
  if (roles.length < 2 || roles.some(role => !isRole(role))) return null
  if (has('semantic') && has('phonetic')) return 'phonoSemantic'
  if (has('semantic')) return has('symbol') ? 'indicative' : 'ideographic'
  if (has('symbol') && !has('phonetic')) return 'sign'
  return null
}

const complete = (part: IdsPart | undefined): boolean =>
  part !== undefined && part !== null && (!isNode(part) || (part.parts.length > 0 && part.parts.every(complete)))

/**
 * A description's tagged parts and formation, using the composition stored for that exact
 * description. A description of one component with no custom parts reads as 獨體. A draft, an
 * empty slot or a text that is not a description gives null.
 */
export function analyze(ids: string | null | undefined, composition: Composition | null = null): Analysis | null {
  const sequence = splitIds(ids)[0]
  if (!sequence) return null
  const parsed = parse(sequence, { open: true })
  if (parsed.problem || parsed.tree === undefined) return null
  let tree = parsed.tree
  // A variant marker or a rotation changes the drawing, not the composition under it.
  while (isNode(tree) && tree.parts.length === 1) tree = tree.parts[0] ?? null
  if (!complete(tree)) return null
  const parsedParts = isNode(tree) ? tree.parts.map(part => write(part)) : []
  const stored = composition?.ids === sequence ? composition : null
  const parts = stored?.parts ?? parsedParts
  const rows = parts.map((part, index) => ({ part, role: stored?.roles[index] ?? '' }))
  const derived = formationOf(rows.map(row => row.role))
  const formation = stored?.formation || derived || (parsedParts.length === 0 && !rows.length ? 'single' : 'unknown')
  const tagged = Boolean(stored && (stored.roles.some(Boolean) || stored.formation))
  return { ids: sequence, parts: rows, derived, formation, tagged }
}
