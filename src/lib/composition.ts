import { compatibilitySequences } from 'ids-input'
// The parts an editor tags for a record's first description, the role each part plays, an optional
// reusable function label describing why that part is used, and the formation those roles imply.
// The parsed parts are a starting point: an editor may replace them, type a role outside the
// standard ones, tag a function for pie-chart analysis, and name a formation the roles cannot express.
import { isNode, parse, write, type IdsPart } from 'ids-input'
import { IDS_LENGTH_MAX, splitIds } from './ids'
import { radicalEquivalent } from './radicals'

import { FORMATIONS, FORMATION_MAX, ROLES, ROLE_MAX, type Formation, type Role } from './composition-labels'
export { FORMATIONS, FORMATION_MAX, ROLES, ROLE_MAX, type Formation, type Role }

export const PARTS_MAX = 8
export const PART_MAX = 200
export const FUNCTION_MAX = 60

/** One part, the role given to it, and an optional reusable function label (作用). */
export type PartRole = { part: string; role: string; func: string }

/**
 * What a record stores for its first description. `parts` is absent in records tagged before parts
 * could be edited; the parts parsed from the description stand in for it. `functions` is omitted
 * when no part has a function label, keeping existing stored claims unchanged.
 */
export type Composition = {
  ids: string
  parts?: string[]
  roles: string[]
  functions?: string[]
  formation: string | null
}

/** The parts tagged for a description and the formation the record shows. */
export type Analysis = {
  ids: string
  parts: PartRole[]
  /** An editor's override, the derived formation, or `single`/`unknown`. */
  formation: string
  /** Whether a stored analysis gives the description roles, functions, or a formation. */
  tagged: boolean
}

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

const clean = (value: unknown, max: number): string =>
  typeof value === 'string' ? [...value.normalize('NFC').trim()].slice(0, max).join('') : ''

function cleanList(value: unknown, max: number, normalize = clean): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, PARTS_MAX).map(item => normalize(item, max))
}

/** Canonical lookup key for a component: compatibility-normalized with radical code points mapped to ideographs (`⺅` → `亻`). */
export function partKey(value: string): string {
  const cleaned = clean(compatibilitySequences(value), PART_MAX)
  if (!cleaned) return ''
  return [...cleaned].map(radicalEquivalent).join('')
}

/** Whether a string is a valid component key for indexing and `/part/<part>` routes. */
export function validPartKey(value: string): boolean {
  if (!value || [...value].length > PART_MAX) return false
  // Reject control characters, whitespace-only, or lone IDS operators.
  if (/[\p{Cc}\s]/u.test(value)) return false
  return [...value].some(char => !/[\u2FF0-\u2FFF\u31EF\u303E]/u.test(char))
}

/** A stored composition, or null when the value is not one this app writes. */
export function parseComposition(value: unknown): Composition | null {
  if (typeof value !== 'string' || !value) return null
  let data: unknown
  try { data = JSON.parse(value) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const stored = data as { ids?: unknown; parts?: unknown; roles?: unknown; functions?: unknown; formation?: unknown }
  const partText = (value: unknown, max: number) => typeof value === 'string' ? clean(compatibilitySequences(value), max) : ''
  const ids = partText(stored.ids, IDS_LENGTH_MAX)
  if (!ids) return null
  const roles = cleanList(stored.roles, ROLE_MAX) ?? []
  const functions = cleanList(stored.functions, FUNCTION_MAX) ?? []
  const parts = cleanList(stored.parts, PART_MAX, partText)
  const formation = clean(stored.formation, FORMATION_MAX) || null
  if (parts) {
    // Parts, roles, and functions belong to one list; an empty part takes its role and function with it.
    const rows = parts
      .map((part, index) => ({ part, role: roles[index] ?? '', func: functions[index] ?? '' }))
      .filter(row => row.part)
    if (!rows.length && !formation) return null
    const keptFunctions = rows.map(row => row.func)
    return {
      ids,
      parts: rows.map(row => row.part),
      roles: rows.map(row => row.role),
      ...(keptFunctions.some(Boolean) ? { functions: keptFunctions } : {}),
      formation,
    }
  }
  // A record tagged before parts could be edited stores the roles alone.
  if (!roles.some(Boolean) && !functions.some(Boolean) && !formation) return null
  return { ids, roles, ...(functions.some(Boolean) ? { functions } : {}), formation }
}

/** The JSON a form carries, or an empty string when it carries no analysis. */
export function composeValue(
  ids: string,
  parts: readonly string[],
  roles: readonly string[],
  formation: string | null,
  functions: readonly string[] = [],
): string {
  const hasFunctions = functions.some(Boolean)
  return parts.length || formation
    ? JSON.stringify({ ids, parts, roles, ...(hasFunctions ? { functions } : {}), formation })
    : ''
}

/**
 * The standard formation the roles imply, or null while a role is custom, missing, or the only part.
 * A symbol beside a semantic part marks a 指事; symbols on their own make a 記號. A part that is
 * both semantic and phonetic (亦聲) is outside the standard roles. An initial speller with a final speller
 * and nothing else makes a 切身.
 */
export function formationOf(roles: readonly string[]): Formation | null {
  const has = (role: Role) => roles.includes(role)
  if (roles.length < 2 || roles.some(role => !isRole(role))) return null
  // A 切身字 is spelled by its parts alone: one gives the initial, another the final.
  if (has('initial') || has('final')) return has('initial') && has('final') && roles.every(role => role === 'initial' || role === 'final') ? 'fanqie' : null
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
  const rows = parts.map((part, index) => ({
    part,
    role: stored?.roles[index] ?? '',
    func: stored?.functions?.[index] ?? '',
  }))
  const derived = formationOf(rows.map(row => row.role))
  const formation = stored?.formation || derived || (parsedParts.length === 0 && !rows.length ? 'single' : 'unknown')
  const tagged = Boolean(stored && (rows.some(row => row.role || row.func) || stored.formation))
  return { ids: sequence, parts: rows, formation, tagged }
}

/** Deduplicated canonical `(part, role, func)` rows to index in `entry_part_roles` for a record. */
export function partRoleRowsOf(ids: string | null | undefined, composition: Composition | null): PartRole[] {
  const analysis = analyze(ids, composition)
  if (!analysis?.tagged) return []
  const seen = new Set<string>()
  const out: PartRole[] = []
  for (const row of analysis.parts) {
    if (!row.role && !row.func) continue
    const key = partKey(row.part)
    if (!validPartKey(key)) continue
    const sig = `${key}\0${row.role}\0${row.func}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push({ part: key, role: row.role, func: row.func })
  }
  return out
}
