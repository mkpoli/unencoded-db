// Forms shared by unrelated words: records linked by `relation: homograph` claims (to an encoded
// character, to an IDS, or to another record by code), grouped into connected components with their
// language, readings, meanings and evidence.
import { codedRecord, recordCode } from '$lib/code'
import { cleanIds, codePointCharacters, codePoints, encodedCharacter as unicodeCodeChar } from '$lib/ids'
import { encodedCharacter as isEncodedCharacter } from '$lib/related'

export const HOMOGRAPH_PAGE = 20
export const HOMOGRAPH_SEEDS = 60
export const HOMOGRAPH_GROUP_MAX = 12
export const HOMOGRAPH_SIGHTINGS = 3
const EXPAND_LIMIT = 200
const MAX_HOPS = 8
const MAX_WINDOWS = 3
const CAP_VALUES = 120

export type HomographCursor = { entry: number; id: number }
export type HomographReading = { value: string; doculect: string | null }
export type HomographSighting = {
  id: number
  place: string
  original_date: string | null
  page: string | null
  title: string | null
  author: string | null
  report_date: string | null
  url: string | null
  thumb_key: string | null
}
export type HomographRecord = {
  id: number
  ids: string | null
  layout: string | null
  cover_key: string | null
  script: string
  script_other: string | null
  sightingCount: number
  readings: HomographReading[]
  meanings: string[]
  unicodeCodes: string[]
  doculects: string[]
  sightings: HomographSighting[]
}
export type HomographEncoded = { char: string; codePoint: string; hasRecord: boolean }
export type HomographGroup = {
  key: string
  encoded: HomographEncoded | null
  formIds: string | null
  formLayout: string | null
  formGlyphId: number | null
  formCover: string | null
  totalRecords: number
  records: HomographRecord[]
}

export function parseHomographCursor(text: string): HomographCursor | null {
  const [, entry, id] = /^([1-9]\d{0,14})\.([1-9]\d{0,14})$/.exec(text) ?? []
  return entry ? { entry: Number(entry), id: Number(id) } : null
}

const isBefore = (a: HomographCursor, b: HomographCursor) => a.entry < b.entry || (a.entry === b.entry && a.id < b.id)
const newerCursor = (a: HomographCursor, b: HomographCursor) => isBefore(a, b) ? b : a

// Bound the index scan before visibility filtering so hidden/merged rows cannot cause an unbounded scan.
export const homographSeedsStatement = (db: D1Database, after: HomographCursor | null, limit = HOMOGRAPH_SEEDS) =>
  db.prepare(`SELECT c.id, c.entry_id, c.value, (e.merged_into IS NULL AND e.hidden_at IS NULL) AS visible
    FROM claims c INDEXED BY claims_homograph
    CROSS JOIN entries e ON e.id = c.entry_id
    WHERE c.kind = 'relation'
      AND json_extract(c.data, '$.relationship') = 'homograph'
      AND (c.entry_id, c.id) < (?, ?)
    ORDER BY c.entry_id DESC, c.id DESC
    LIMIT ?`)
    .bind(after?.entry ?? Number.MAX_SAFE_INTEGER, after?.id ?? Number.MAX_SAFE_INTEGER, limit)

export const homographsByValueStatement = (db: D1Database, values: readonly string[], limit = EXPAND_LIMIT) =>
  db.prepare(`SELECT c.id, c.entry_id, c.value
    FROM json_each(?) j
    CROSS JOIN claims c INDEXED BY claims_homograph_by_value
      ON c.value = j.value
      AND c.kind = 'relation'
      AND json_extract(c.data, '$.relationship') = 'homograph'
    CROSS JOIN entries e ON e.id = c.entry_id
    WHERE e.merged_into IS NULL AND e.hidden_at IS NULL
    LIMIT ?`)
    .bind(JSON.stringify(values.slice(0, CAP_VALUES)), limit)

export const homographsByEntryStatement = (db: D1Database, entryIds: readonly number[], limit = EXPAND_LIMIT) =>
  db.prepare(`SELECT c.id, c.entry_id, c.value
    FROM json_each(?) j
    CROSS JOIN claims c INDEXED BY claims_homograph
      ON c.entry_id = j.value
      AND c.kind = 'relation'
      AND json_extract(c.data, '$.relationship') = 'homograph'
    CROSS JOIN entries e ON e.id = c.entry_id
    WHERE e.merged_into IS NULL AND e.hidden_at IS NULL
    LIMIT ?`)
    .bind(JSON.stringify(entryIds.slice(0, CAP_VALUES)), limit)

export const resolveMergedCodesStatement = (db: D1Database, ids: readonly number[], limit = EXPAND_LIMIT * 2) =>
  db.prepare(`WITH RECURSIVE named(origin, id) AS (
      SELECT value, value FROM json_each(?)
      UNION ALL
      SELECT n.origin, e.merged_into FROM named n JOIN entries e ON e.id = n.id WHERE e.merged_into IS NOT NULL LIMIT ?
    )
    SELECT n.origin, n.id AS entry_id FROM named n JOIN entries e ON e.id = n.id WHERE e.merged_into IS NULL AND e.hidden_at IS NULL`)
    .bind(JSON.stringify(ids.slice(0, CAP_VALUES)), limit)

export const mergedIntoStatement = (db: D1Database, liveIds: readonly number[], limit = EXPAND_LIMIT * 2) =>
  db.prepare(`WITH RECURSIVE parts(root, id) AS (
      SELECT value, value FROM json_each(?)
      UNION ALL
      SELECT p.root, e.id FROM parts p JOIN entries e INDEXED BY entries_merged ON e.merged_into = p.id WHERE e.merged_into IS NOT NULL LIMIT ?
    )
    SELECT root, id FROM parts WHERE id != root`)
    .bind(JSON.stringify(liveIds.slice(0, CAP_VALUES)), limit)

export const encodedEntriesStatement = (db: D1Database, codes: readonly string[], limit = EXPAND_LIMIT) =>
  db.prepare(`SELECT c.entry_id, c.value
    FROM json_each(?) j
    CROSS JOIN claims c INDEXED BY claims_by_value ON c.kind = 'encoding' AND c.value = j.value
    CROSS JOIN entries e ON e.id = c.entry_id
    WHERE json_extract(c.data, '$.charset') = 'unicode'
      AND e.merged_into IS NULL AND e.hidden_at IS NULL
    LIMIT ?`)
    .bind(JSON.stringify(codes.slice(0, CAP_VALUES)), limit)

export const idsEntriesStatement = (db: D1Database, idsValues: readonly string[], limit = EXPAND_LIMIT) =>
  db.prepare(`SELECT c.entry_id, c.value
    FROM json_each(?) j
    CROSS JOIN claims c INDEXED BY claims_by_value ON c.kind = 'ids' AND c.value = j.value
    CROSS JOIN entries e ON e.id = c.entry_id
    WHERE e.merged_into IS NULL AND e.hidden_at IS NULL
    LIMIT ?`)
    .bind(JSON.stringify(idsValues.slice(0, CAP_VALUES)), limit)

export const homographEntriesStatement = (db: D1Database, entryIds: readonly number[]) =>
  db.prepare(`SELECT e.id, e.ids, e.layout, e.cover_key, e.script, e.script_other, e.sightings
    FROM json_each(?) j
    CROSS JOIN entries e ON e.id = j.value
    WHERE e.merged_into IS NULL AND e.hidden_at IS NULL`)
    .bind(JSON.stringify(entryIds))

export const homographClaimsStatement = (db: D1Database, entryIds: readonly number[]) =>
  db.prepare(`SELECT c.entry_id, c.position, c.kind, c.value, c.data
    FROM json_each(?) j
    CROSS JOIN claims c INDEXED BY claims_by_entry ON c.entry_id = j.value
    WHERE +c.kind IN ('meaning', 'reading', 'encoding', 'ids')`)
    .bind(JSON.stringify(entryIds))

export const homographSightingsStatement = (db: D1Database, entryIds: readonly number[]) =>
  db.prepare(`SELECT s.entry_id, s.id, s.place, s.original_date, s.page,
      c.title, c.author, c.report_date, c.url, x.thumb_key
    FROM json_each(?) j
    CROSS JOIN sightings s ON s.id IN (
      SELECT id FROM sightings INDEXED BY sightings_visible_export
      WHERE entry_id = j.value AND hidden_at IS NULL
      ORDER BY id LIMIT ${HOMOGRAPH_SIGHTINGS}
    )
    LEFT JOIN sources c ON c.id = s.source_id
    LEFT JOIN sighting_media x ON x.sighting_id = s.id AND x.position = 0`)
    .bind(JSON.stringify(entryIds))

type SeedRow = { id: number; entry_id: number; value: string }
type Target =
  | { kind: 'code'; id: number }
  | { kind: 'char'; char: string; codePoint: string }
  | { kind: 'ids'; ids: string }

function classifyTarget(raw: string): Target | null {
  const record = codedRecord(raw)
  if (record !== null) return { kind: 'code', id: record }
  const fromCode = codePointCharacters(raw)
  const candidate = fromCode || raw.normalize('NFC').trim()
  if (isEncodedCharacter(candidate)) return { kind: 'char', char: candidate, codePoint: codePoints(candidate) }
  const ids = cleanIds(raw)
  return ids ? { kind: 'ids', ids } : null
}

const codeSpellings = (char: string) => { const upper = codePoints(char); return [upper, upper.toLowerCase()] }
const charSpellings = (char: string) => [char, ...codeSpellings(char)]

class UnionFind {
  private parent = new Map<string, string>()
  find(x: string): string {
    let root = this.parent.get(x)
    if (root === undefined) { this.parent.set(x, x); return x }
    while (root !== this.parent.get(root)) root = this.parent.get(root)!
    let cur = x
    while (cur !== root) { const next = this.parent.get(cur)!; this.parent.set(cur, root); cur = next }
    return root
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent.set(rb, ra)
  }
}

type PendingGroup = {
  leader: HomographCursor
  entryIds: number[]
  totalRecords: number
  encoded: HomographEncoded | null
  targetIds: string | null
}

async function expandWindow(db: D1Database, seeds: readonly SeedRow[]) {
  const claims = new Map<number, SeedRow>()
  const knownEntries = new Set<number>()
  const resolvedCodes = new Map<number, number>()
  const mergedAliases = new Map<number, number>() // mergedId -> liveRoot
  const encodedByChar = new Map<string, Set<number>>()
  const idsEntries = new Map<string, Set<number>>()

  const queriedValues = new Set<string>()
  const queriedEntries = new Set<number>()
  const queriedCodes = new Set<number>()
  const queriedMerged = new Set<number>()
  const queriedChars = new Set<string>()
  const queriedIds = new Set<string>()

  const addClaims = (rows: readonly SeedRow[]) => {
    for (const row of rows) {
      claims.set(row.id, row)
      knownEntries.add(row.entry_id)
    }
  }
  addClaims(seeds)

  // Bounded fixpoint expansion pulls in reverse record-code links, merged targets, shared
  // encoded-character / IDS targets, and chained record-to-record homographs.
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const needCodes: number[] = []
    const needChars: string[] = []
    const needIds: string[] = []
    const needValues: string[] = []

    for (const claim of claims.values()) {
      const target = classifyTarget(claim.value)
      if (!target) continue
      if (target.kind === 'code') {
        if (!queriedCodes.has(target.id)) { queriedCodes.add(target.id); needCodes.push(target.id) }
      } else if (target.kind === 'char') {
        if (!queriedChars.has(target.char)) { queriedChars.add(target.char); needChars.push(target.char) }
        for (const spelling of charSpellings(target.char)) {
          if (!queriedValues.has(spelling)) { queriedValues.add(spelling); needValues.push(spelling) }
        }
      } else {
        if (!queriedIds.has(target.ids)) { queriedIds.add(target.ids); needIds.push(target.ids) }
        for (const spelling of [...new Set([claim.value, target.ids])]) {
          if (!queriedValues.has(spelling)) { queriedValues.add(spelling); needValues.push(spelling) }
        }
      }
    }

    const needMerged: number[] = []
    for (const id of knownEntries) {
      if (!queriedMerged.has(id)) { queriedMerged.add(id); needMerged.push(id) }
      const code = recordCode(id)
      if (!queriedValues.has(code)) { queriedValues.add(code); needValues.push(code) }
    }
    for (const aliasId of mergedAliases.keys()) {
      const code = recordCode(aliasId)
      if (!queriedValues.has(code)) { queriedValues.add(code); needValues.push(code) }
    }

    const needEntries: number[] = []
    for (const id of knownEntries) {
      if (!queriedEntries.has(id)) { queriedEntries.add(id); needEntries.push(id) }
    }

    const tasks: { kind: string; stmt: D1PreparedStatement }[] = []
    if (needCodes.length) tasks.push({ kind: 'codes', stmt: resolveMergedCodesStatement(db, needCodes) })
    if (needMerged.length) tasks.push({ kind: 'merged', stmt: mergedIntoStatement(db, needMerged) })
    if (needChars.length) tasks.push({ kind: 'encoded', stmt: encodedEntriesStatement(db, needChars.flatMap(codeSpellings)) })
    if (needIds.length) tasks.push({ kind: 'ids', stmt: idsEntriesStatement(db, needIds) })
    if (needValues.length) tasks.push({ kind: 'byValue', stmt: homographsByValueStatement(db, needValues) })
    if (needEntries.length) tasks.push({ kind: 'byEntry', stmt: homographsByEntryStatement(db, needEntries) })
    if (!tasks.length) break

    const batch = await db.batch<unknown>(tasks.map(task => task.stmt))
    let grew = false
    for (let i = 0; i < tasks.length; i++) {
      const kind = tasks[i].kind
      const rows = batch[i].results
      if (kind === 'codes') {
        for (const row of rows as { origin: number; entry_id: number }[]) {
          resolvedCodes.set(Number(row.origin), row.entry_id)
          if (!knownEntries.has(row.entry_id)) { knownEntries.add(row.entry_id); grew = true }
        }
      } else if (kind === 'merged') {
        for (const row of rows as { root: number; id: number }[]) {
          if (!mergedAliases.has(row.id)) { mergedAliases.set(row.id, Number(row.root)); grew = true }
        }
      } else if (kind === 'encoded') {
        for (const row of rows as { entry_id: number; value: string }[]) {
          const char = unicodeCodeChar(row.value)
          if (!char) continue
          const set = encodedByChar.get(char) ?? new Set<number>()
          set.add(row.entry_id)
          encodedByChar.set(char, set)
          if (!knownEntries.has(row.entry_id)) { knownEntries.add(row.entry_id); grew = true }
        }
      } else if (kind === 'ids') {
        for (const row of rows as { entry_id: number; value: string }[]) {
          const normalized = cleanIds(row.value)
          const set = idsEntries.get(normalized) ?? new Set<number>()
          set.add(row.entry_id)
          idsEntries.set(normalized, set)
          if (!knownEntries.has(row.entry_id)) { knownEntries.add(row.entry_id); grew = true }
        }
      } else {
        for (const row of rows as SeedRow[]) {
          if (!claims.has(row.id)) { claims.set(row.id, row); grew = true }
          if (!knownEntries.has(row.entry_id)) { knownEntries.add(row.entry_id); grew = true }
        }
      }
    }
    if (!grew) break
  }

  // Final check for homograph claims naming any merged aliases discovered on the last hop.
  const trailingCodes: string[] = []
  for (const aliasId of mergedAliases.keys()) {
    const code = recordCode(aliasId)
    if (!queriedValues.has(code)) { queriedValues.add(code); trailingCodes.push(code) }
  }
  const trailingEntries = [...knownEntries].filter(id => !queriedEntries.has(id))
  if (trailingCodes.length || trailingEntries.length) {
    const extraTasks: D1PreparedStatement[] = []
    if (trailingCodes.length) extraTasks.push(homographsByValueStatement(db, trailingCodes))
    if (trailingEntries.length) extraTasks.push(homographsByEntryStatement(db, trailingEntries))
    for (const { results } of await db.batch<SeedRow>(extraTasks)) {
      addClaims(results)
    }
  }

  // Build connected components across records and shared homograph targets.
  const uf = new UnionFind()
  const entryNode = (id: number) => `e:${id}`
  const charNode = (char: string) => `c:${char}`
  const idsNode = (ids: string) => `i:${ids}`

  const claimLinks: { claim: SeedRow; target: Target }[] = []
  for (const claim of claims.values()) {
    const target = classifyTarget(claim.value)
    if (!target) continue
    claimLinks.push({ claim, target })
    const from = entryNode(claim.entry_id)
    uf.find(from)
    if (target.kind === 'code') {
      const live = resolvedCodes.get(target.id) ?? mergedAliases.get(target.id)
      if (live !== undefined) uf.union(from, entryNode(live))
    } else if (target.kind === 'char') {
      const node = charNode(target.char)
      uf.union(from, node)
      for (const entryId of encodedByChar.get(target.char) ?? []) uf.union(node, entryNode(entryId))
    } else {
      const node = idsNode(target.ids)
      uf.union(from, node)
      for (const entryId of idsEntries.get(target.ids) ?? []) uf.union(node, entryNode(entryId))
    }
  }

  type Component = {
    leader: HomographCursor
    entries: Set<number>
    chars: Map<string, string> // char -> codePoint
    idsTargets: Set<string>
  }
  const components = new Map<string, Component>()
  const ensure = (root: string, seed: HomographCursor): Component => {
    let comp = components.get(root)
    if (!comp) {
      comp = { leader: seed, entries: new Set(), chars: new Map(), idsTargets: new Set() }
      components.set(root, comp)
    }
    return comp
  }

  for (const { claim, target } of claimLinks) {
    const root = uf.find(entryNode(claim.entry_id))
    const cursor: HomographCursor = { entry: claim.entry_id, id: claim.id }
    const comp = ensure(root, cursor)
    comp.leader = newerCursor(comp.leader, cursor)
    comp.entries.add(claim.entry_id)
    if (target.kind === 'code') {
      const live = resolvedCodes.get(target.id) ?? mergedAliases.get(target.id)
      if (live !== undefined) comp.entries.add(live)
    } else if (target.kind === 'char') {
      comp.chars.set(target.char, target.codePoint)
      for (const entryId of encodedByChar.get(target.char) ?? []) comp.entries.add(entryId)
    } else {
      comp.idsTargets.add(target.ids)
      for (const entryId of idsEntries.get(target.ids) ?? []) comp.entries.add(entryId)
    }
  }

  const pending: PendingGroup[] = []
  for (const comp of components.values()) {
    const entryIds = [...comp.entries].sort((a, b) => a - b)
    const firstChar = comp.chars.entries().next().value as [string, string] | undefined
    const encoded: HomographEncoded | null = firstChar
      ? { char: firstChar[0], codePoint: firstChar[1], hasRecord: [...(encodedByChar.get(firstChar[0]) ?? [])].some(id => comp.entries.has(id)) }
      : null
    const targetIds = comp.idsTargets.values().next().value ?? null
    if (entryIds.length >= 2 || (entryIds.length === 1 && encoded !== null && !encoded.hasRecord)) {
      pending.push({ leader: comp.leader, entryIds: entryIds.slice(0, HOMOGRAPH_GROUP_MAX), totalRecords: entryIds.length, encoded, targetIds })
    }
  }
  return pending
}

type EntryMetaRow = { id: number; ids: string | null; layout: string | null; cover_key: string | null; script: string; script_other: string | null; sightings: number }
type ClaimMetaRow = { entry_id: number; position: number; kind: string; value: string; data: string | null }
type SightingMetaRow = HomographSighting & { entry_id: number }

export async function homographPage(db: D1Database, after: HomographCursor | null = null): Promise<{ groups: HomographGroup[]; next: string | null }> {
  const collected = new Map<string, PendingGroup>()
  let cursor = after
  let exhausted = false
  let lastSeed: HomographCursor | null = null

  for (let window = 0; window < MAX_WINDOWS; window++) {
    const { results: rawSeeds } = await homographSeedsStatement(db, cursor, HOMOGRAPH_SEEDS).all<SeedRow & { visible: number }>()
    if (!rawSeeds.length) { exhausted = true; break }
    const tail = rawSeeds.at(-1)!
    lastSeed = { entry: tail.entry_id, id: tail.id }
    const seeds = rawSeeds.filter(row => row.visible)
    const expanded = seeds.length ? await expandWindow(db, seeds) : []
    for (const group of expanded) {
      if (after && !isBefore(group.leader, after)) continue
      const key = `${group.leader.entry}.${group.leader.id}`
      if (!collected.has(key)) collected.set(key, group)
    }
    if (rawSeeds.length < HOMOGRAPH_SEEDS) { exhausted = true; break }
    if (collected.size > HOMOGRAPH_PAGE) break
    cursor = lastSeed
  }

  const ordered = [...collected.values()].sort((a, b) => b.leader.entry - a.leader.entry || b.leader.id - a.leader.id)
  const more = ordered.length > HOMOGRAPH_PAGE
  const chosen = ordered.slice(0, HOMOGRAPH_PAGE)
  const next = more
    ? `${chosen.at(-1)!.leader.entry}.${chosen.at(-1)!.leader.id}`
    : !exhausted && lastSeed
      ? `${lastSeed.entry}.${lastSeed.id}`
      : null

  if (!chosen.length) return { groups: [], next }

  const entryIds = [...new Set(chosen.flatMap(group => group.entryIds))]
  const [entriesRes, claimsRes, sightingsRes] = await db.batch<unknown>([
    homographEntriesStatement(db, entryIds),
    homographClaimsStatement(db, entryIds),
    homographSightingsStatement(db, entryIds),
  ])

  const entryMap = new Map<number, EntryMetaRow>()
  for (const row of entriesRes.results as EntryMetaRow[]) entryMap.set(row.id, row)

  const readingsByEntry = new Map<number, HomographReading[]>()
  const meaningsByEntry = new Map<number, string[]>()
  const unicodeByEntry = new Map<number, string[]>()
  const idsByEntry = new Map<number, string[]>()

  const sortedClaims = [...(claimsRes.results as ClaimMetaRow[])].sort((a, b) => a.entry_id - b.entry_id || a.position - b.position)
  for (const row of sortedClaims) {
    const data = row.data ? JSON.parse(row.data) as Record<string, unknown> : null
    if (row.kind === 'reading') {
      const doculect = typeof data?.doculect === 'string' && data.doculect ? data.doculect : null
      const list = readingsByEntry.get(row.entry_id) ?? []
      list.push({ value: row.value, doculect })
      readingsByEntry.set(row.entry_id, list)
    } else if (row.kind === 'meaning') {
      const list = meaningsByEntry.get(row.entry_id) ?? []
      list.push(row.value)
      meaningsByEntry.set(row.entry_id, list)
    } else if (row.kind === 'encoding' && data?.charset === 'unicode') {
      const list = unicodeByEntry.get(row.entry_id) ?? []
      list.push(row.value)
      unicodeByEntry.set(row.entry_id, list)
    } else if (row.kind === 'ids') {
      const list = idsByEntry.get(row.entry_id) ?? []
      list.push(row.value)
      idsByEntry.set(row.entry_id, list)
    }
  }

  const sightingsByEntry = new Map<number, HomographSighting[]>()
  const sortedSightings = [...(sightingsRes.results as SightingMetaRow[])].sort((a, b) => a.entry_id - b.entry_id || a.id - b.id)
  for (const { entry_id, ...sighting } of sortedSightings) {
    const list = sightingsByEntry.get(entry_id) ?? []
    list.push(sighting)
    sightingsByEntry.set(entry_id, list)
  }

  const groups: HomographGroup[] = []
  for (const group of chosen) {
    const records: HomographRecord[] = []
    for (const id of group.entryIds) {
      const meta = entryMap.get(id)
      if (!meta) continue
      const readings = readingsByEntry.get(id) ?? []
      const doculects = [...new Set(readings.flatMap(reading => reading.doculect ? [reading.doculect] : []))]
      records.push({
        id: meta.id,
        ids: meta.ids ?? idsByEntry.get(id)?.[0] ?? null,
        layout: meta.layout,
        cover_key: meta.cover_key,
        script: meta.script,
        script_other: meta.script_other,
        sightingCount: meta.sightings,
        readings,
        meanings: meaningsByEntry.get(id) ?? [],
        unicodeCodes: unicodeByEntry.get(id) ?? [],
        doculects,
        sightings: sightingsByEntry.get(id) ?? [],
      })
    }
    if (records.length < 2 && !(records.length === 1 && group.encoded && !group.encoded.hasRecord)) continue
    const withIds = records.find(record => record.ids)
    const withCover = records.find(record => record.cover_key)
    const formIds = group.targetIds ?? withIds?.ids ?? null
    const matchingIdsRecord = formIds ? records.find(record => record.ids === formIds) : null
    groups.push({
      key: `${group.leader.entry}.${group.leader.id}`,
      encoded: group.encoded,
      formIds,
      formLayout: matchingIdsRecord?.layout ?? (formIds === withIds?.ids ? withIds?.layout ?? null : null),
      formGlyphId: matchingIdsRecord?.id ?? (formIds === withIds?.ids ? withIds?.id ?? null : null),
      formCover: withCover?.cover_key ?? null,
      totalRecords: Math.max(group.totalRecords, records.length),
      records,
    })
  }

  return { groups, next }
}
