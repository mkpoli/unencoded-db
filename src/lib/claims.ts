// What a record states about its character more than once. Each statement is a claim: a kind, the value
// it is found by and what else that kind records. A claim has a key of its own within the record, names
// the sightings that support it, and may hold only under other claims of the record: a reading under a
// meaning, a related character under a meaning or a reading. The kinds live here, so a new one is an
// entry in this file and its form fields, and the database stays as it is.
import { codedRecord, recordCode } from './code'
import { analyze, parseComposition, type Composition } from './composition'
import { cleanCode, isRegistry, type Encoding } from './registries'
import { cleanTag, isCollection, validTagName, type Tag } from './tags'
import { IDS_LENGTH_MAX, IDS_MAX, splitIds } from './ids'
import { carryLayout, cleanLayout, validLayout, type Layout } from './layout'
import { ivdSequence } from './ivd'
import { cleanDoculect } from './doculects'
import { isRelationKind } from './related'
import { nameLabel } from './name-key'

export const CLAIM_KINDS = ['ids', 'composition', 'reading', 'meaning', 'encoding', 'relation', 'ivd', 'collection', 'tag', 'creator'] as const
export type ClaimKind = (typeof CLAIM_KINDS)[number]
export type Claim = { key: string; kind: ClaimKind; value: string; data: Record<string, unknown> | null; sightings: number[]; under: string[] }

/** The kinds of claim under which a claim of each kind may hold. A reading goes with a meaning; a related
 * character is related under a meaning, a reading or both. Every other kind states a fact of the whole record. */
export const SCOPES: Record<ClaimKind, readonly ClaimKind[]> = { ids: [], composition: [], reading: ['meaning'], meaning: [], encoding: [], relation: ['meaning', 'reading'], ivd: [], collection: [], tag: [], creator: [] }
/** How many sightings one claim names, and how many claims it holds under. */
export const CLAIM_SIGHTINGS_MAX = 20
export const CLAIM_SCOPES_MAX = 20

const KEY = /^[0-9a-z]{8}$/
export const isClaimKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value)
/** A key for a claim that is being made. It stays with the claim through every edit. */
export const newClaimKey = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => (byte % 36).toString(36)).join('')

/** How many claims of a kind one record holds, and how long each value runs. */
export const CLAIM_LIMITS: Record<ClaimKind, { max: number; length: number }> = {
  ids: { max: IDS_MAX, length: IDS_LENGTH_MAX },
  composition: { max: 1, length: IDS_LENGTH_MAX },
  reading: { max: 20, length: 200 },
  meaning: { max: 20, length: 500 },
  encoding: { max: 20, length: 80 },
  relation: { max: 50, length: 80 },
  ivd: { max: 1, length: 80 },
  collection: { max: 10, length: 40 },
  tag: { max: 30, length: 40 },
  creator: { max: 10, length: 80 },
}
export const CLAIMS_MAX = 200
/** The most text one record's claims hold together, so a journal page of snapshots stays small. */
export const CLAIMS_LENGTH_MAX = 70000

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

/** Whether a value can name who made a character: a name as written, on one line, that a list can be kept by. */
export const validCreator = (value: string) => [value, creatorKey(value)].every(name => Boolean(name) && name.length <= CLAIM_LIMITS.creator.length && !/[|\p{Cc}]|\s{2}/u.test(name)) && value === value.normalize('NFC').trim()
/** The name a creator is listed under: its compatibility spellings and spacing made one. */
export const creatorKey = (value: string) => nameLabel(value)

type Links = { key?: string; sightings?: number[]; under?: string[] }
export const newClaim = (kind: ClaimKind, value: string, data: Record<string, unknown> | null = null, links: Links = {}): Claim => ({ key: links.key ?? newClaimKey(), kind, value, data, sightings: links.sightings ?? [], under: links.under ?? [] })
const one = newClaim
// A list of distinct references, no longer than a claim holds.
const listed = (value: unknown, max: number, test: (item: unknown) => boolean): boolean => Array.isArray(value) && value.length <= max && value.every(test) && new Set(value).size === value.length

/** Whether a stored or submitted claim is one this app writes. */
export function validClaim(claim: unknown): claim is Claim {
  if (!plain(claim) || !isKind(claim.kind) || typeof claim.value !== 'string') return false
  const { kind, value } = claim
  const data = claim.data ?? null
  if (data !== null && !plain(data)) return false
  if (!isClaimKey(claim.key)) return false
  if (!listed(claim.sightings, CLAIM_SIGHTINGS_MAX, item => Number.isSafeInteger(item) && (item as number) > 0)) return false
  if (!listed(claim.under, SCOPES[kind].length ? CLAIM_SCOPES_MAX : 0, isClaimKey)) return false
  if (!value || value.length > CLAIM_LIMITS[kind].length || value !== value.normalize('NFC').trim()) return false
  switch (kind) {
    case 'ids': return splitIds(value).length === 1 && splitIds(value)[0] === value && (data === null || (Object.keys(data).length === 1 && validLayout(data.layout, value)))
    case 'composition': return Boolean(data && parseComposition(JSON.stringify({ ...data, ids: value })))
    case 'encoding': return Boolean(data && typeof data.charset === 'string' && data.charset.length > 0 && data.charset.length <= 40)
    case 'relation': return Boolean(data && isRelationKind(data.relationship) && short(data.difference ?? '', 5000) && short(data.evidence ?? '', 5000))
    case 'ivd': return value === 'none' || ivdSequence(value) === value
    case 'collection': return isCollection(value)
    case 'tag': return validTagName(value)
    case 'creator': return data === null && validCreator(value)
    case 'reading': return data === null || (Object.keys(data).length === 1 && cleanDoculect(data.doculect) === data.doculect)
    default: return true
  }
}

/** Stored claims in order, or null when the value is not a list this app writes. */
export function parseClaims(raw: unknown): Claim[] | null {
  let value = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!Array.isArray(value) || value.length > CLAIMS_MAX) return null
  // Older snapshots stored categories as `genre` claims; fold them into unified `tag` claims.
  const seenTags = new Set<string>()
  const normalized = value.flatMap(item => {
    if (!plain(item)) return [item]
    if ((item.kind === 'genre' || item.kind === 'tag') && typeof item.value === 'string') {
      const cleaned = item.kind === 'tag' ? item.value.replace(/^#+/, '') : item.value
      if (seenTags.has(cleaned)) return []
      seenTags.add(cleaned)
      return [{ ...item, kind: 'tag', value: cleaned }]
    }
    return [item]
  })
  if (!normalized.every(validClaim)) return null
  const claims = normalized.map(claim => one(claim.kind, claim.value, claim.data ?? null, { key: claim.key, sightings: [...claim.sightings], under: [...claim.under] }))
  // A key names one claim, and a claim holds only under claims of the same list whose kind can be its scope.
  const kinds = new Map(claims.map(claim => [claim.key, claim.kind]))
  if (kinds.size !== claims.length) return null
  if (claims.some(claim => claim.under.some(key => !SCOPES[claim.kind].includes(kinds.get(key)!)))) return null
  for (const kind of CLAIM_KINDS) if (claims.filter(claim => claim.kind === kind).length > CLAIM_LIMITS[kind].max) return null
  if (JSON.stringify(claims).length > CLAIMS_LENGTH_MAX) return null
  return claims
}

// Two claims state the same thing when their kind, value and data are equal, whatever they rest on.
const stated = (claim: Claim) => JSON.stringify([claim.kind, claim.value, claim.data && Object.keys(claim.data).sort().map(name => [name, claim.data![name]])])
// A kind is joined after the kinds it may hold under, so a claim knows whether its scopes came along.
const depth = (kind: ClaimKind): number => SCOPES[kind].length ? 1 + Math.max(...SCOPES[kind].map(depth)) : 0
const link = (claim: string, scope: string) => `${claim}>${scope}`

/** What a merge gave the record that stays: the keys of the claims it did not hold before, and the scopes
 * its own claims gained, each as `claim>scope`. */
export type Joined = { added: string[]; scoped: string[] }

/** The claims of a record that takes in a duplicate's. A claim both records state is kept once and rests on
 * the sightings of both; any other claim of the duplicate is added after the record's own, as far as the
 * limits of a record allow. A claim that holds under others comes only with at least one of them. */
export function joinClaims(kept: readonly Claim[], joining: readonly Claim[]): Joined & { claims: Claim[] } {
  const claims = kept.map(claim => ({ ...claim, sightings: [...claim.sightings], under: [...claim.under] }))
  const held = new Map(claims.map(claim => [stated(claim), claim]))
  const byKey = new Map(claims.map(claim => [claim.key, claim]))
  const count = new Map<ClaimKind, number>()
  for (const claim of claims) count.set(claim.kind, (count.get(claim.kind) ?? 0) + 1)
  let length = JSON.stringify(claims).length
  // A list grows by what it writes, and stops where the record's claims would run too long.
  const grown = <T>(own: T[], more: T[], max: number) => {
    const next = [...new Set([...own, ...more])].slice(0, max)
    const size = JSON.stringify(next).length - JSON.stringify(own).length
    if (length + size > CLAIMS_LENGTH_MAX) return own
    length += size
    return next
  }
  // The key each claim of the duplicate goes by in the record that stays.
  const renamed = new Map<string, string>()
  const added: { claim: Claim; place: number }[] = []
  const scoped: string[] = []
  const ordered = joining.map((claim, place) => ({ claim, place })).sort((a, b) => depth(a.claim.kind) - depth(b.claim.kind) || a.place - b.place)
  for (const { claim, place } of ordered) {
    const under = claim.under.flatMap(scope => renamed.get(scope) ?? [])
    let into = held.get(stated(claim))
    if (!into) {
      if (claim.under.length && !under.length) continue
      const copy: Claim = { ...claim, key: byKey.has(claim.key) ? newClaimKey() : claim.key, sightings: [], under: [] }
      const size = JSON.stringify(copy).length + 1
      if (claims.length + added.length >= CLAIMS_MAX || (count.get(claim.kind) ?? 0) >= CLAIM_LIMITS[claim.kind].max || length + size > CLAIMS_LENGTH_MAX) continue
      length += size
      count.set(claim.kind, (count.get(claim.kind) ?? 0) + 1)
      held.set(stated(copy), copy)
      byKey.set(copy.key, copy)
      added.push({ claim: copy, place })
      into = copy
    }
    const target = into
    renamed.set(claim.key, target.key)
    target.sightings = grown(target.sightings, claim.sightings, CLAIM_SIGHTINGS_MAX)
    const before = new Set(target.under)
    target.under = grown(target.under, under.filter(scope => scope !== target.key && SCOPES[target.kind].includes(byKey.get(scope)!.kind)), CLAIM_SCOPES_MAX)
    if (claims.includes(target)) scoped.push(...target.under.filter(scope => !before.has(scope)).map(scope => link(target.key, scope)))
  }
  added.sort((a, b) => a.place - b.place)
  return { claims: [...claims, ...added.map(item => item.claim)], added: added.map(item => item.claim.key), scoped }
}

/** Splits off the relations that name one of `records` by its code. Two records a merge makes one have no
 * relation left between them. No claim holds under a relation, so the claims that stay keep their scopes. */
export function relationsTo(claims: readonly Claim[], records: ReadonlySet<number>): { kept: Claim[]; dropped: Claim[] } {
  const named = (claim: Claim) => claim.kind === 'relation' && records.has(codedRecord(claim.value) ?? 0)
  return { kept: claims.filter(claim => !named(claim)), dropped: claims.filter(named) }
}

/** Puts back the relations a merge dropped, after the claims the record holds now: each one it no longer states,
 * resting on the sightings it still holds and under the scopes that are still there, while a record's limits allow. */
export function restoreClaims(claims: readonly Claim[], dropped: readonly Claim[], sightings: ReadonlySet<number>): Claim[] {
  const restored = [...claims]
  const held = new Set(claims.map(stated)), keys = new Set(claims.map(claim => claim.key))
  for (const claim of dropped) {
    if (held.has(stated(claim)) || restored.length >= CLAIMS_MAX || restored.filter(item => item.kind === claim.kind).length >= CLAIM_LIMITS[claim.kind].max) continue
    const copy = { ...claim, key: keys.has(claim.key) ? newClaimKey() : claim.key, sightings: claim.sightings.filter(id => sightings.has(id)), under: claim.under.filter(scope => keys.has(scope)) }
    if (JSON.stringify([...restored, copy]).length > CLAIMS_LENGTH_MAX) continue
    restored.push(copy)
    held.add(stated(copy))
    keys.add(copy.key)
  }
  return restored
}

/** A record's claims once a duplicate has parted from it. No claim rests on a sighting of `gone`. What the
 * merges gave the record (`merged`) leaves too, unless it rests on a sighting that stays or a duplicate
 * that is still joined (`still`, the claims of each) states it. */
export function partClaims(claims: readonly Claim[], gone: ReadonlySet<number>, merged: Joined, still: readonly (readonly Claim[])[] = []): Claim[] {
  const says = new Set<string>()
  for (const list of still) {
    const byKey = new Map(list.map(claim => [claim.key, claim]))
    for (const claim of list) {
      says.add(stated(claim))
      for (const scope of claim.under) if (byKey.has(scope)) says.add(link(stated(claim), stated(byKey.get(scope)!)))
    }
  }
  const added = new Set(merged.added), scoped = new Set(merged.scoped)
  const left = claims.map(claim => ({ ...claim, sightings: claim.sightings.filter(id => !gone.has(id)) })).filter(claim => !added.has(claim.key) || claim.sightings.length > 0 || says.has(stated(claim)))
  const byKey = new Map(left.map(claim => [claim.key, claim]))
  return left.map(claim => ({ ...claim, under: claim.under.filter(scope => byKey.has(scope) && (!scoped.has(link(claim.key, scope)) || says.has(link(stated(claim), stated(byKey.get(scope)!))))) }))
}

// What evidence says of its character. A description, a code or a tag is a record's own and stays with it.
const SAID_BY_EVIDENCE: readonly ClaimKind[] = ['reading', 'meaning', 'relation', 'creator']

/** What a sighting brought to a record it moved to, by key: the claims the record did not hold before, and
 * its own claims that rest on the sighting since. */
export type Brought = { added: string[]; joined: string[] }

/** The claims of two records once a sighting moves from the one to the other, record `to`. What rests on it
 * alone goes along, with the claims it holds under; what rests on more is stated on both. A claim stays when
 * the other record states it under other scopes or has no room for it, or is the record it relates to.
 * `came` is what the sighting brought when it moved to the first record, which goes again with it. */
export function moveClaims(from: readonly Claim[], into: readonly Claim[], sighting: number, to: number, came: Brought = { added: [], joined: [] }): { from: Claim[]; into: Claim[]; brought: Brought } {
  const ours = new Map(from.map(claim => [claim.key, claim])), theirs = new Map(into.map(claim => [claim.key, claim]))
  const same = new Map(into.map(claim => [stated(claim), claim]))
  const scopes = (claim: Claim, held: Map<string, Claim>) => JSON.stringify(claim.under.flatMap(key => held.get(key) ? [stated(held.get(key)!)] : []).sort())
  const said = new Set(from.filter(claim => {
    if (!SAID_BY_EVIDENCE.includes(claim.kind) || !claim.sightings.includes(sighting)) return false
    const other = same.get(stated(claim))
    return !(claim.kind === 'relation' && codedRecord(claim.value) === to) && (!other || scopes(other, theirs) === scopes(claim, ours))
  }).map(claim => claim.key))
  // A claim that holds under others takes them along, resting on nothing there.
  const carried = new Set(said)
  for (const key of carried) for (const scope of ours.get(key)?.under ?? []) carried.add(scope)
  const joined = joinClaims(into, from.filter(claim => carried.has(claim.key)).map(claim => ({ ...claim, sightings: said.has(claim.key) ? [sighting] : [], under: same.has(stated(claim)) ? [] : claim.under })))
  // A scope whose claim had no room there is not kept for itself.
  const added = new Set(joined.added)
  let claims = joined.claims
  for (let idle = true; idle;) {
    const used = new Set(claims.flatMap(claim => claim.under))
    const left = claims.filter(claim => !added.has(claim.key) || claim.sightings.length || used.has(claim.key))
    idle = left.length < claims.length
    claims = left
  }
  const taken = new Set(claims.filter(claim => claim.sightings.includes(sighting)).map(stated))
  const brought = { added: claims.filter(claim => added.has(claim.key)).map(claim => claim.key), joined: claims.filter(claim => theirs.has(claim.key) && !theirs.get(claim.key)!.sightings.includes(sighting) && claim.sightings.includes(sighting)).map(claim => claim.key) }
  const gone = new Set(from.filter(claim => {
    if (came.joined.includes(claim.key) || claim.sightings.some(id => id !== sighting)) return false
    return claim.sightings.length ? said.has(claim.key) && taken.has(stated(claim)) : came.added.includes(claim.key)
  }).map(claim => claim.key))
  for (let more = true; more;) {
    more = false
    for (const claim of from) if (!gone.has(claim.key)) for (const scope of claim.under) more = gone.delete(scope) || more
  }
  return { from: from.filter(claim => !gone.has(claim.key)).map(claim => ({ ...claim, sightings: claim.sightings.filter(id => id !== sighting) })), into: claims, brought }
}

export const claimsOf = (claims: readonly Claim[], kind: ClaimKind) => claims.filter(claim => claim.kind === kind)
export const valuesOf = (claims: readonly Claim[], kind: ClaimKind) => claimsOf(claims, kind).map(claim => claim.value)

/** The description whose glyph the record draws. */
export const primaryIdsOf = (claims: readonly Claim[]) => claims.find(claim => claim.kind === 'ids')?.value ?? null
/** How the parts of a description are moved in its drawing, or null when they stand where the composer put them. */
export const layoutOf = (claim: Claim | undefined): Layout | null => (claim?.kind === 'ids' && claim.data?.layout ? claim.data.layout as Layout : null)
export const primaryLayoutOf = (claims: readonly Claim[]) => layoutOf(claims.find(claim => claim.kind === 'ids'))
/** The descriptions a record states, in order, each with the layout stored for it. A description that
 * normalizes into one already listed is left out, so spellings that clean into one sequence draw once. */
export function idsForms(claims: readonly Claim[]) {
  const forms: { ids: string; layout: Layout | null }[] = []
  const seen = new Set<string>()
  for (const claim of claimsOf(claims, 'ids')) {
    for (const ids of splitIds(claim.value)) {
      if (seen.has(ids)) continue
      seen.add(ids)
      forms.push({ ids, layout: layoutOf(claim) })
    }
  }
  return forms
}

export function compositionOf(claims: readonly Claim[]): Composition | null {
  const claim = claims.find(item => item.kind === 'composition')
  return claim ? parseComposition(JSON.stringify({ ...claim.data, ids: claim.value })) : null
}

export type { Encoding }
export const encodingsOf = (claims: readonly Claim[]): Encoding[] => claimsOf(claims, 'encoding').map(claim => ({ charset: String(claim.data?.charset), code: claim.value }))

// The links of a record read from either side.
/** The claims that hold under the claim with this key. */
export const claimsUnder = (claims: readonly Claim[], key: string) => claims.filter(claim => claim.under.includes(key))
/** The claims a claim holds under, in the order it names them. */
export const scopesOf = (claims: readonly Claim[], claim: Claim) => claim.under.map(key => claims.find(scope => scope.key === key)).filter(scope => scope !== undefined)
/** The claims a sighting supports. */
export const supportedBy = (claims: readonly Claim[], sighting: number) => claims.filter(claim => claim.sightings.includes(sighting))

/** The claims with each sighting named as `to` answers, and without the ones it answers null for. */
export const mapSightings = (claims: readonly Claim[], to: (sighting: number) => number | null): Claim[] => claims.map(claim => {
  if (!claim.sightings.length) return claim
  return { ...claim, sightings: [...new Set(claim.sightings.map(to).filter(id => id !== null))].sort((a, b) => a - b) }
})

export type ClaimError = 'ids' | 'encodings' | 'relatedCharacters' | 'ivd' | 'readings' | 'tags' | 'creators' | 'links'

// The form fields of each kind. A group is replaced when the form carries it, by its own field or by
// the `<group>_present` marker a list of rows sends even when it is empty; otherwise the record keeps
// what it has.
//
// A row of readings, meanings, creators or related characters sends its claim's key in `<group>_key`, and the row's
// links in fields named after that key: `sightings.<key>` once for each sighting that supports it and
// `under.<key>` once for each claim it holds under. The key is made with the row, in the browser, so a row
// can name another row of the same form. A row without a key, and every claim of the other kinds,
// continues the claim of the record that states the same thing, and is a new claim otherwise.
function rows(form: FormData, names: readonly string[], max: number): string[][] | null {
  const columns = names.map(name => form.getAll(name))
  const count = columns[0].length
  if (count > max || columns.some(column => column.length !== count || column.some(value => typeof value !== 'string'))) return null
  return Array.from({ length: count }, (_, row) => columns.map(column => clean(column[row])))
}

function typed(form: FormData, names: readonly string[]): string[][] {
  const columns = names.map(name => form.getAll(name).map(value => typeof value === 'string' ? value : ''))
  return Array.from({ length: Math.max(...columns.map(column => column.length)) }, (_, row) => columns.map(column => column[row] ?? ''))
}

const KEY_FIELDS = ['reading_key', 'meaning_key', 'related_key', 'creator_key']
// What tells one claim of a kind from another when no key does: a kind a record holds once is one claim.
const identity = (kind: ClaimKind, value: string, data: Claim['data']) => CLAIM_LIMITS[kind].max === 1 ? '' : `${value}\n${kind === 'reading' ? data?.doculect ?? '' : kind === 'encoding' ? data?.charset ?? '' : ''}`

/**
 * The claims a form submits, over the ones the record holds for the groups the form leaves out. With
 * an error, the claims are a draft to show again and not to store. A tag is named by its canonical name
 * or display label among `tags`.
 */
export function readClaims(form: FormData, tags: readonly Pick<Tag, 'name' | 'label'>[], base: readonly Claim[] = []): { claims: Claim[]; error: ClaimError | null } {
  const next = new Map<ClaimKind, Claim[]>()
  let error: ClaimError | null = null
  const fail = (code: ClaimError) => { error ??= code }
  for (const kind of CLAIM_KINDS) next.set(kind, claimsOf(base, kind))

  const kindOf = new Map(base.map(claim => [claim.key, claim.kind]))
  // Every key a row of the form carries, whether or not the row is kept.
  const submitted = new Set(KEY_FIELDS.flatMap(name => form.getAll(name)).filter(isClaimKey))
  const taken = new Set<string>()
  // A row left out as a repeat of another: what names it means the row that is kept.
  const repeats = new Map<string, string>()
  const linksOf = (key: string): Links => ({
    key,
    sightings: [...new Set(form.getAll(`sightings.${key}`).map(clean).filter(text => /^[1-9]\d{0,15}$/.test(text)).map(Number))].sort((a, b) => a - b),
    under: [...new Set(form.getAll(`under.${key}`).map(clean))],
  })
  // The key and links of a claim the form states: its row's own, or those of the claim it continues.
  const made = (kind: ClaimKind, value: string, data: Claim['data'] = null, given = ''): Claim => {
    if (isClaimKey(given) && !taken.has(given) && (kindOf.get(given) ?? kind) === kind) { taken.add(given); return one(kind, value, data, linksOf(given)) }
    const same = identity(kind, value, data)
    const old = base.find(claim => claim.kind === kind && !taken.has(claim.key) && !submitted.has(claim.key) && identity(kind, claim.value, claim.data) === same)
    const claim = one(kind, value, data, old ? { key: old.key, sightings: old.sightings, under: old.under } : {})
    taken.add(claim.key)
    return claim
  }
  const draft = (kind: ClaimKind, value: string, data: Claim['data'], given = '') => one(kind, value, data, isClaimKey(given) ? linksOf(given) : {})

  if (form.has('ids')) {
    const values = form.getAll('ids')
    const sequences = splitIds(values.filter(value => typeof value === 'string').join(' '))
    if (values.some(value => typeof value !== 'string') || sequences.length > IDS_MAX || sequences.some(sequence => sequence.length > IDS_LENGTH_MAX)) fail('ids')
    // A layout belongs to the description it was drawn over, which the form names in `layout_ids`. It is
    // the first description's when that is the one named; when the first is a new description, the moves
    // of the parts it kept from the named one go with it. A description the record already holds, and
    // every description the form does not speak for, keeps its own.
    const kept = new Map(claimsOf(base, 'ids').map(claim => [claim.value, claim.data]))
    const layoutIds = form.get('layout_ids')
    const drawn = typeof layoutIds === 'string' ? splitIds(layoutIds)[0] : undefined
    const spoken = form.has('layout') && drawn && sequences.length > 0 && (drawn === sequences[0] || !kept.has(sequences[0]))
    const stated = spoken ? carryLayout(cleanLayout(clean(form.get('layout')), drawn), drawn, sequences[0]) : undefined
    next.set('ids', sequences.map((sequence, index) => made('ids', sequence, index === 0 && stated !== undefined ? stated && { layout: stated } : kept.get(sequence) ?? null)))
  }
  const primary = next.get('ids')![0]?.value ?? null

  // Roles belong to one sequence: a changed first description takes them away unless the form names it.
  if (form.has('composition')) {
    const parsed = parseComposition(form.get('composition'))
    const analysis = parsed && primary && parsed.ids === primary ? analyze(primary, parsed) : null
    const parts = analysis?.parts.map(part => part.part) ?? [], roles = analysis?.parts.map(part => part.role) ?? []
    next.set('composition', analysis && parsed && (roles.some(Boolean) || parsed.formation) ? [made('composition', primary!, { parts, roles, formation: parsed.formation })] : [])
  } else if (next.get('composition')![0]?.value !== primary) next.set('composition', [])

  // A reading may name its doculect in `reading_doculect`, which then runs parallel to `reading`.
  for (const kind of ['reading', 'meaning'] as const) {
    if (!form.has(kind) && !form.has(`${kind}s_present`)) continue
    const names = [kind, ...[`${kind}_doculect`, `${kind}_key`].filter(name => form.has(name))]
    const column = (row: string[], name: string) => names.includes(name) ? row[names.indexOf(name)] : ''
    const found = rows(form, names, CLAIM_LIMITS[kind].max * 2)
    const seen = new Map<string, string>()
    const out: Claim[] = []
    let bad = !found
    for (const row of found ?? []) {
      const value = row[0], stated = column(row, `${kind}_doculect`), given = column(row, `${kind}_key`)
      const doculect = stated ? cleanDoculect(stated) : null
      if ((stated && !doculect) || value.length > CLAIM_LIMITS[kind].length) { bad = true; break }
      if (!value) continue
      const repeated = seen.get(`${doculect ?? ''}\n${value}`)
      if (repeated) { if (isClaimKey(given)) repeats.set(given, repeated); continue }
      const claim = made(kind, value, doculect ? { doculect } : null, given)
      seen.set(`${doculect ?? ''}\n${value}`, claim.key)
      out.push(claim)
    }
    if (bad || out.length > CLAIM_LIMITS[kind].max) { fail('readings'); next.set(kind, typed(form, [kind, `${kind}_doculect`, `${kind}_key`]).filter(([value]) => value.trim()).map(([value, doculect, given]) => draft(kind, value, doculect ? { doculect } : null, given))) }
    else next.set(kind, out)
  }

  // Who made the character, one name to a row.
  if (form.has('creator') || form.has('creators_present')) {
    const names = ['creator', ...(form.has('creator_key') ? ['creator_key'] : [])]
    const found = rows(form, names, CLAIM_LIMITS.creator.max * 2)
    const seen = new Map<string, string>()
    const out: Claim[] = []
    let bad = !found
    for (const [typedName, given = ''] of found ?? []) {
      const value = typedName.replace(/\s+/gu, ' ')
      if (!value) continue
      if (!validCreator(value)) { bad = true; break }
      const repeated = seen.get(creatorKey(value))
      if (repeated) { if (isClaimKey(given)) repeats.set(given, repeated); continue }
      const claim = made('creator', value, null, given)
      seen.set(creatorKey(value), claim.key)
      out.push(claim)
    }
    if (bad || out.length > CLAIM_LIMITS.creator.max) { fail('creators'); next.set('creator', typed(form, ['creator', 'creator_key']).filter(([value]) => value.trim()).map(([value, given]) => draft('creator', value, null, given))) }
    else next.set('creator', out)
  }

  if (form.has('encodings_present') || form.has('encoding_code')) {
    const found = rows(form, ['encoding_charset', 'encoding_code'], CLAIM_LIMITS.encoding.max * 2)
    const seen = new Set<string>()
    const out: Claim[] = []
    let bad = !found
    for (const [set, code] of found ?? []) {
      const value = cleanCode(code)
      if (!value) continue
      const charset = set
      if (!charset || value.length > CLAIM_LIMITS.encoding.length || charset.length > 40 || (!isRegistry(charset) && /[|]/.test(charset))) bad = true
      if (seen.has(`${charset}|${value}`)) continue
      seen.add(`${charset}|${value}`)
      out.push(made('encoding', value, { charset }))
    }
    if (bad || out.length > CLAIM_LIMITS.encoding.max) { fail('encodings'); next.set('encoding', typed(form, ['encoding_charset', 'encoding_code']).map(([charset, code]) => one('encoding', code, { charset }))) }
    else next.set('encoding', out)
  }

  if (form.has('related_characters_present')) {
    const names = ['related_character', 'related_relationship', 'related_difference', 'related_evidence', ...(form.has('related_key') ? ['related_key'] : [])]
    const found = rows(form, names, CLAIM_LIMITS.relation.max)
    const valid = found?.every(([character, relationship, difference, evidence]) => character && character.length <= CLAIM_LIMITS.relation.length && isRelationKind(relationship) && difference.length <= 5000 && evidence.length <= 5000)
    if (!valid) fail('relatedCharacters')
    next.set('relation', (valid ? found! : typed(form, names)).map(([character, relationship, difference, evidence, given]) =>
      (valid ? made : draft)('relation', valid && codedRecord(character) ? recordCode(codedRecord(character)!) : character, { relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) }, given)))
  }

  if (form.has('ivd_status')) {
    const status = clean(form.get('ivd_status')), sequence = clean(form.get('ivd_sequence'))
    const canonical = status === 'registered' ? ivdSequence(sequence) : null
    if (!['', 'none', 'registered'].includes(status) || (status === 'registered' ? !canonical : Boolean(sequence))) fail('ivd')
    next.set('ivd', status === 'none' ? [made('ivd', 'none')] : canonical ? [made('ivd', canonical)] : sequence ? [made('ivd', sequence)] : [])
  }

  if (form.has('collections_present')) {
    const chosen = new Set(form.getAll('collection').map(clean))
    next.set('collection', [...chosen].filter(isCollection).map(slug => made('collection', slug)))
  }

  if (form.has('tags_present') || form.has('tag') || form.has('tags') || form.has('genres_present') || form.has('genre')) {
    const chosen = new Set<string>()
    for (const raw of [...form.getAll('tag'), ...form.getAll('genre')]) {
      const name = cleanTag(clean(raw), tags)
      if (name) chosen.add(name)
    }
    const typed = form.getAll('tags').flatMap(value => clean(value).split(/[\s,，、|]+/u)).map(token => token.replace(/^#+/, '').trim()).filter(Boolean)
    let bad = false
    const draftTokens: string[] = []
    for (const token of typed) {
      const name = cleanTag(token, tags)
      if (!name) bad = true
      else chosen.add(name)
      draftTokens.push(name ?? token)
    }
    const combined = [...chosen]
    if (bad || combined.length > CLAIM_LIMITS.tag.max) {
      fail('tags')
      next.set('tag', [...new Set([...chosen, ...draftTokens])].slice(0, CLAIM_LIMITS.tag.max).map(tag => draft('tag', tag, null)))
    } else {
      next.set('tag', combined.map(tag => made('tag', tag)))
    }
  }

  // A claim holds under claims that are still stated. One that was stated, in the record or in a row of
  // this form, and is stated no longer takes its place in every scope with it; a name for anything else is
  // not a scope.
  const stated = new Map(CLAIM_KINDS.flatMap(kind => next.get(kind)!).map(claim => [claim.key, claim.kind]))
  const claims = CLAIM_KINDS.flatMap(kind => next.get(kind)!).map(claim => {
    if (claim.sightings.length > CLAIM_SIGHTINGS_MAX) fail('links')
    if (!claim.under.length) return claim
    const under: string[] = []
    for (const key of new Set(claim.under.map(key => repeats.get(key) ?? key))) {
      const kind = stated.get(key)
      if (kind && SCOPES[claim.kind].includes(kind)) under.push(key)
      else if (kind || !(kindOf.has(key) || submitted.has(key))) fail('links')
    }
    if (under.length > CLAIM_SCOPES_MAX) fail('links')
    return { ...claim, under }
  })
  if (JSON.stringify(claims).length > CLAIMS_LENGTH_MAX) fail('relatedCharacters')
  return { claims, error }
}
