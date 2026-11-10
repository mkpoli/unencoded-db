// The parts a description breaks into, the role each part plays in the character, and the
// formation the roles imply. Only the parts an operator writes directly are tagged: a character's
// 構字方式 is decided at that level, and a nested part is a character of its own.
import { isNode, parse, write, type IdsPart } from 'ids-input'
import { splitIds } from './ids'

export const ROLES = ['semantic', 'phonetic', 'symbol'] as const
export type Role = (typeof ROLES)[number]
export type RoleChoice = Role | ''

export const FORMATIONS = ['phonoSemantic', 'ideographic', 'indicative', 'sign', 'single', 'unknown'] as const
export type Formation = (typeof FORMATIONS)[number]

/** A description, its top-level parts, and the role given to each part. */
export type Analysis = {
  ids: string
  parts: string[]
  roles: RoleChoice[]
  formation: Formation
}

/** What a record stores: roles named against the exact sequence they were chosen for. */
export type Composition = { ids: string; roles: RoleChoice[] }

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

/** A stored composition, or null when the value is not one this app writes. */
export function parseComposition(value: unknown): Composition | null {
  if (typeof value !== 'string' || !value) return null
  let data: unknown
  try { data = JSON.parse(value) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const { ids, roles } = data as { ids?: unknown; roles?: unknown }
  if (typeof ids !== 'string' || !ids || !Array.isArray(roles) || roles.length > ROLES.length) return null
  const choices = roles.map(role => isRole(role) ? role : '')
  return choices.some(Boolean) ? { ids, roles: choices } : null
}

/** The value a form carries for these roles, or an empty string while none is chosen. */
export function serializeComposition(ids: string, roles: readonly RoleChoice[]): string {
  return roles.some(Boolean) ? JSON.stringify({ ids, roles }) : ''
}

/**
 * The formation the roles imply, or null while any part is untagged or the roles leave it open. A
 * symbol beside a semantic part marks a 指事; symbols on their own make a 記號. A phonetic part with
 * nothing semantic, and a part that is both (亦聲), are outside the three roles.
 */
export function formationOf(roles: readonly RoleChoice[]): Formation | null {
  const has = (role: Role) => roles.includes(role)
  if (!roles.length || roles.some(role => !role)) return null
  if (has('semantic') && has('phonetic')) return 'phonoSemantic'
  if (has('semantic')) return has('symbol') ? 'indicative' : 'ideographic'
  if (has('symbol') && !has('phonetic')) return 'sign'
  return null
}

const complete = (part: IdsPart | undefined): boolean =>
  part !== undefined && part !== null && (!isNode(part) || (part.parts.length > 0 && part.parts.every(complete)))

/**
 * A description's top-level parts, with the roles stored for it. A description of one component has
 * no parts to tag and reads as 獨體. A draft, an empty slot or a text that is not a description
 * gives null.
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
  if (!isNode(tree)) return { ids: sequence, parts: [], roles: [], formation: 'single' }
  const parts = tree.parts.map(part => write(part))
  const roles = parts.map((_, index) => composition?.ids === sequence ? composition.roles[index] ?? '' : '')
  return { ids: sequence, parts, roles, formation: formationOf(roles) ?? 'unknown' }
}
