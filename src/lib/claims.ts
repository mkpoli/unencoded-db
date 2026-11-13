// What a record states about its character more than once. Each statement is a claim: a kind, the value
// it is found by, what else that kind records, and the sighting it rests on. The kinds live here, so a
// new one is an entry in this file and its form fields, and the database stays as it is.
import { analyze, parseComposition, type Composition } from './composition'
import { cleanEncodingCode, isEncodingSet } from './encodings'
import { genreOf, isCollection } from './genres'
import { IDS_LENGTH_MAX, IDS_MAX, splitIds } from './ids'
import { ivdSequence } from './ivd'
import { cleanDoculect } from './doculects'
import { isRelationKind, type RelatedDraft } from './related'

export const CLAIM_KINDS = ['ids', 'composition', 'reading', 'meaning', 'encoding', 'relation', 'ivd', 'genre', 'collection', 'tag'] as const
export type ClaimKind = (typeof CLAIM_KINDS)[number]
export type Claim = { kind: ClaimKind; value: string; data: Record<string, unknown> | null; sighting_id: number | null }

/** How many claims of a kind one record holds, and how long each value runs. */
export const CLAIM_LIMITS: Record<ClaimKind, { max: number; length: number }> = {
  ids: { max: IDS_MAX, length: IDS_LENGTH_MAX },
  composition: { max: 1, length: IDS_LENGTH_MAX },
  reading: { max: 20, length: 200 },
  meaning: { max: 20, length: 500 },
  encoding: { max: 20, length: 80 },
  relation: { max: 50, length: 80 },
  ivd: { max: 1, length: 80 },
  genre: { max: 30, length: 40 },
  collection: { max: 10, length: 40 },
  tag: { max: 30, length: 40 },
}
export const CLAIMS_MAX = 200
/** The most text one record's claims hold together, so a journal page of snapshots stays small. */
export const CLAIMS_LENGTH_MAX = 60000

const isKind = (value: unknown): value is ClaimKind => CLAIM_KINDS.includes(value as ClaimKind)
const clean = (value: unknown) => (typeof value === 'string' ? value : '').normalize('NFC').trim()
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const short = (value: unknown, max: number) => typeof value === 'string' && value.length <= max

// A lone combining mark, variation selector or format control is not a character a reader can point at.
const ATTACHED = /^[\p{M}\p{Cf}︀-️\u{E0100}-\u{E01EF}]$/u
const ATTACHED_ONLY = /^[\p{M}\p{Cf}︀-️\u{E0100}-\u{E01EF}]/u

/** Text as the characters a reader sees, with variation selectors and combining marks kept attached. */
export function splitCharacters(value: string): string[] {
  const characters: string[] = []
  for (const character of value.normalize('NFC')) {
    if (characters.length > 0 && ATTACHED.test(character)) characters[characters.length - 1] += character
    else characters.push(character)
  }
  return characters
}

const one = (kind: ClaimKind, value: string, data: Record<string, unknown> | null = null, sighting_id: number | null = null): Claim => ({ kind, value, data, sighting_id })

/** Whether a stored or submitted claim is one this app writes. */
export function validClaim(claim: unknown): claim is Claim {
  if (!plain(claim) || !isKind(claim.kind) || typeof claim.value !== 'string') return false
  const { kind, value } = claim
  const data = claim.data ?? null
  if (data !== null && !plain(data)) return false
  if (claim.sighting_id != null && !(Number.isSafeInteger(claim.sighting_id) && (claim.sighting_id as number) > 0)) return false
  if (!value || value.length > CLAIM_LIMITS[kind].length || value !== value.normalize('NFC').trim()) return false
  switch (kind) {
    case 'ids': return splitIds(value).length === 1 && splitIds(value)[0] === value
    case 'composition': return Boolean(data && parseComposition(JSON.stringify({ ...data, ids: value })))
    case 'encoding': return Boolean(data && typeof data.charset === 'string' && data.charset.length > 0 && data.charset.length <= 40)
    case 'relation': return Boolean(data && isRelationKind(data.relationship) && short(data.difference ?? '', 5000) && short(data.evidence ?? '', 5000))
    case 'ivd': return value === 'none' || ivdSequence(value) === value
    case 'genre': return Boolean(genreOf(value))
    case 'collection': return isCollection(value)
    case 'tag': return !/[\s,，、|]/u.test(value)
    case 'reading': return data === null || (Object.keys(data).length === 1 && cleanDoculect(data.doculect) === data.doculect)
    default: return true
  }
}

/** Stored claims in order, or null when the value is not a list this app writes. */
export function parseClaims(raw: unknown): Claim[] | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!Array.isArray(value) || value.length > CLAIMS_MAX || !value.every(validClaim)) return null
  const claims = value.map(claim => one(claim.kind, claim.value, claim.data ?? null, claim.sighting_id ?? null))
  for (const kind of CLAIM_KINDS) if (claims.filter(claim => claim.kind === kind).length > CLAIM_LIMITS[kind].max) return null
  if (JSON.stringify(claims).length > CLAIMS_LENGTH_MAX) return null
  return claims
}

export const claimsOf = (claims: readonly Claim[], kind: ClaimKind) => claims.filter(claim => claim.kind === kind)
export const valuesOf = (claims: readonly Claim[], kind: ClaimKind) => claimsOf(claims, kind).map(claim => claim.value)

/** The description whose glyph the record draws. */
export const primaryIdsOf = (claims: readonly Claim[]) => claims.find(claim => claim.kind === 'ids')?.value ?? null

export function compositionOf(claims: readonly Claim[]): Composition | null {
  const claim = claims.find(item => item.kind === 'composition')
  return claim ? parseComposition(JSON.stringify({ ...claim.data, ids: claim.value })) : null
}

export type Encoding = { charset: string; code: string }
export const encodingsOf = (claims: readonly Claim[]): Encoding[] => claimsOf(claims, 'encoding').map(claim => ({ charset: String(claim.data?.charset), code: claim.value }))

export const relationsOf = (claims: readonly Claim[]): (RelatedDraft & { sighting_id: number | null })[] => claimsOf(claims, 'relation').map(claim => ({
  character: claim.value, relationship: String(claim.data?.relationship), difference: String(claim.data?.difference ?? ''), evidence: String(claim.data?.evidence ?? ''), sighting_id: claim.sighting_id,
}))

export type ClaimError = 'ids' | 'encodings' | 'relatedCharacters' | 'ivd' | 'readings' | 'tags'

// The form fields of each kind. A group is replaced when the form carries it, by its own field or by
// the `<group>_present` marker a list of rows sends even when it is empty; otherwise the record keeps
// what it has.
const sightingRef = (value: unknown) => {
  const text = clean(value)
  return /^[1-9]\d{0,15}$/.test(text) ? Number(text) : null
}

function rows(form: FormData, names: readonly string[], max: number): string[][] | null {
  const columns = names.map(name => form.getAll(name))
  const count = columns[0].length
  if (count > max || columns.some(column => column.length !== count || column.some(value => typeof value !== 'string'))) return null
  return Array.from({ length: count }, (_, row) => columns.map(column => clean(column[row])))
}

// A reading may name its doculect in `reading_doculect`, which then runs parallel to `reading`.
function texts(form: FormData, kind: 'reading' | 'meaning'): Claim[] | null {
  const names = [kind, `${kind}_sighting`, `${kind}_doculect`].filter(name => name === kind || form.has(name))
  const found = rows(form, names, CLAIM_LIMITS[kind].max * 2)
  if (!found) return null
  const column = (row: string[], name: string) => names.includes(name) ? row[names.indexOf(name)] : ''
  const seen = new Set<string>()
  const out: Claim[] = []
  for (const row of found) {
    const value = row[0], stated = column(row, `${kind}_doculect`)
    const doculect = stated ? cleanDoculect(stated) : null
    if (stated && !doculect) return null
    if (!value || seen.has(`${doculect ?? ''}\n${value}`)) continue
    if (value.length > CLAIM_LIMITS[kind].length) return null
    seen.add(`${doculect ?? ''}\n${value}`)
    out.push(one(kind, value, doculect ? { doculect } : null, sightingRef(column(row, `${kind}_sighting`))))
  }
  return out.length > CLAIM_LIMITS[kind].max ? null : out
}

function typed(form: FormData, names: readonly string[]): string[][] {
  const columns = names.map(name => form.getAll(name).map(value => typeof value === 'string' ? value : ''))
  return Array.from({ length: Math.max(...columns.map(column => column.length)) }, (_, row) => columns.map(column => column[row] ?? ''))
}

/**
 * The claims a form submits, over the ones the record holds for the groups the form leaves out. With
 * an error, the claims are a draft to show again and not to store.
 */
export function readClaims(form: FormData, base: readonly Claim[] = []): { claims: Claim[]; error: ClaimError | null } {
  const next = new Map<ClaimKind, Claim[]>()
  let error: ClaimError | null = null
  const fail = (code: ClaimError) => { error ??= code }
  for (const kind of CLAIM_KINDS) next.set(kind, claimsOf(base, kind))

  if (form.has('ids')) {
    const values = form.getAll('ids')
    const sequences = splitIds(values.filter(value => typeof value === 'string').join(' '))
    if (values.some(value => typeof value !== 'string') || sequences.length > IDS_MAX || sequences.some(sequence => sequence.length > IDS_LENGTH_MAX)) fail('ids')
    next.set('ids', sequences.map(sequence => one('ids', sequence)))
  }
  const primary = next.get('ids')![0]?.value ?? null

  // Roles belong to one sequence: a changed first description takes them away unless the form names it.
  if (form.has('composition')) {
    const parsed = parseComposition(form.get('composition'))
    const analysis = parsed && primary && parsed.ids === primary ? analyze(primary, parsed) : null
    const parts = analysis?.parts.map(part => part.part) ?? [], roles = analysis?.parts.map(part => part.role) ?? []
    next.set('composition', analysis && parsed && (roles.some(Boolean) || parsed.formation) ? [one('composition', primary!, { parts, roles, formation: parsed.formation })] : [])
  } else if (next.get('composition')![0]?.value !== primary) next.set('composition', [])

  for (const kind of ['reading', 'meaning'] as const) {
    if (!form.has(kind) && !form.has(`${kind}s_present`)) continue
    const found = texts(form, kind)
    if (found) next.set(kind, found)
    else { fail('readings'); next.set(kind, typed(form, [kind, `${kind}_doculect`]).filter(([value]) => value.trim()).map(([value, doculect]) => one(kind, value, doculect ? { doculect } : null))) }
  }

  if (form.has('encodings_present') || form.has('encoding_code')) {
    const found = rows(form, ['encoding_charset', 'encoding_code'], CLAIM_LIMITS.encoding.max * 2)
    const seen = new Set<string>()
    const out: Claim[] = []
    let bad = !found
    for (const [set, code] of found ?? []) {
      const value = cleanEncodingCode(code)
      if (!value) continue
      const charset = set
      if (!charset || value.length > CLAIM_LIMITS.encoding.length || charset.length > 40 || (!isEncodingSet(charset) && /[|]/.test(charset))) bad = true
      if (seen.has(`${charset}|${value}`)) continue
      seen.add(`${charset}|${value}`)
      out.push(one('encoding', value, { charset }))
    }
    if (bad || out.length > CLAIM_LIMITS.encoding.max) { fail('encodings'); next.set('encoding', typed(form, ['encoding_charset', 'encoding_code']).map(([charset, code]) => one('encoding', code, { charset }))) }
    else next.set('encoding', out)
  }

  if (form.has('related_characters_present')) {
    const names = ['related_character', 'related_relationship', 'related_difference', 'related_evidence', ...(form.has('related_sighting') ? ['related_sighting'] : [])]
    const found = rows(form, names, CLAIM_LIMITS.relation.max)
    const valid = found?.every(([character, relationship, difference, evidence]) => character && character.length <= CLAIM_LIMITS.relation.length && isRelationKind(relationship) && difference.length <= 5000 && evidence.length <= 5000)
    if (!valid) fail('relatedCharacters')
    next.set('relation', (valid ? found! : typed(form, names)).map(([character, relationship, difference, evidence, sighting]) =>
      one('relation', character, { relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) }, sightingRef(sighting))))
  }

  if (form.has('ivd_status')) {
    const status = clean(form.get('ivd_status')), sequence = clean(form.get('ivd_sequence'))
    const canonical = status === 'registered' ? ivdSequence(sequence) : null
    if (!['', 'none', 'registered'].includes(status) || (status === 'registered' ? !canonical : Boolean(sequence))) fail('ivd')
    next.set('ivd', status === 'none' ? [one('ivd', 'none')] : canonical ? [one('ivd', canonical)] : sequence ? [one('ivd', sequence)] : [])
  }

  if (form.has('genres_present')) {
    const chosen = new Set(form.getAll('genre').map(clean))
    next.set('genre', [...chosen].filter(slug => genreOf(slug)).slice(0, CLAIM_LIMITS.genre.max).map(slug => one('genre', slug)))
  }
  if (form.has('collections_present')) {
    const chosen = new Set(form.getAll('collection').map(clean))
    next.set('collection', [...chosen].filter(isCollection).map(slug => one('collection', slug)))
  }

  if (form.has('tags')) {
    const tags = [...new Set(form.getAll('tags').flatMap(value => clean(value).split(/[\s,，、|]+/u)).map(tag => tag.replace(/^#/, '')).filter(Boolean))]
    if (tags.length > CLAIM_LIMITS.tag.max || tags.some(tag => tag.length > CLAIM_LIMITS.tag.length)) fail('tags')
    next.set('tag', tags.map(tag => one('tag', tag)))
  }

  const claims = CLAIM_KINDS.flatMap(kind => next.get(kind)!)
  if (JSON.stringify(claims).length > CLAIMS_LENGTH_MAX) fail('relatedCharacters')
  return { claims, error }
}
