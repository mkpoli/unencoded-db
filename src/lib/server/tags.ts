import { GROUPS_MAX, TAG_ALIASES_MAX, TAG_CLOSURE_MAX, TAG_IMPLIES_MAX, byGroupOrder, byTagOrder, canImply, cleanTag, isTagType, validGroupLabel, validTagName, type Tag, type TagGroup, type TagType } from '$lib/tags'

type Who = { actor: string; ip: string | null }
const now = () => new Date().toISOString()

// Every tag with the records filed under it (directly or via implications): the table in type/position
// order, the counts looked up by key, and capped. `used` asks, by the claims index, whether any record
// names each one directly, hidden and merged records too, or whether it has aliases.
export const TAGS_MAX = 1000
export const tagsStatement = (db: D1Database, used = false) =>
  db.prepare(`SELECT c.name, c.label, c.type, c.position, c.rev, c.group_id, COALESCE(t.n, 0) AS n${used ? ", EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = c.name) OR EXISTS (SELECT 1 FROM tag_aliases WHERE tag = c.name) AS used" : ''} FROM tags c LEFT JOIN tag_counts t ON t.tag = 't:' || c.name ORDER BY c.type, c.position, c.name LIMIT ${TAGS_MAX}`)
export const implicationsStatement = (db: D1Database) =>
  db.prepare(`SELECT tag, implies FROM tag_implications ORDER BY tag, implies LIMIT ${TAGS_MAX * TAG_IMPLIES_MAX}`)

export const aliasesStatement = (db: D1Database) =>
  db.prepare(`SELECT tag, alias FROM tag_aliases ORDER BY tag, alias LIMIT ${TAGS_MAX * TAG_ALIASES_MAX}`)

export async function tagList(db: D1Database, used = false): Promise<Tag[]> {
  const [rows, edges, aliases] = await db.batch<Record<string, unknown>>([tagsStatement(db, used), implicationsStatement(db), aliasesStatement(db)])
  const impliesMap = new Map<string, string[]>()
  for (const row of edges.results as { tag: string; implies: string }[]) {
    impliesMap.set(row.tag, [...(impliesMap.get(row.tag) ?? []), row.implies])
  }
  const aliasMap = new Map<string, string[]>()
  for (const row of aliases.results as { tag: string; alias: string }[]) {
    aliasMap.set(row.tag, [...(aliasMap.get(row.tag) ?? []), row.alias])
  }
  return (rows.results as (Omit<Tag, 'implies' | 'used' | 'group' | 'aliases'> & { group_id: number | null; used?: number | boolean })[]).map(({ used: rawUsed, group_id, ...row }) => ({
    ...row,
    group: group_id,
    implies: impliesMap.get(row.name) ?? [],
    aliases: aliasMap.get(row.name) ?? [],
    ...(used ? { used: Boolean(rawUsed) } : {}),
  }))
}

export const groupsStatement = (db: D1Database) =>
  db.prepare(`SELECT id, type, label, position, rev FROM tag_groups ORDER BY type, position, id LIMIT ${GROUPS_MAX}`)
export async function groupList(db: D1Database): Promise<TagGroup[]> {
  const { results } = await groupsStatement(db).all<TagGroup>()
  return results
}
/** The three tiers at once: the tags and the groups they sit in. */
export async function taxonomy(db: D1Database, used = false) {
  const [tags, groups] = await Promise.all([tagList(db, used), groupList(db)])
  return { tags, groups }
}

// The latest changes of the tags, newest first, with who made each: a range of the key from the end.
export const CHANGES_SHOWN = 20
// `retype` is the kind older type changes were logged as; a type change is now a `move`.
export type TagChangeKind = 'create' | 'move' | 'rename' | 'retype' | 'imply' | 'unimply' | 'merge' | 'split' | 'alias' | 'unalias' | 'delete'
export type TagSubject = 'tag' | 'group'
export type TagChange = { id: number; subject: TagSubject; name: string; kind: TagChangeKind; before: string | null; after: string | null; at: string; by_id: string | null; by_name: string | null }
export const changesStatement = (db: D1Database) =>
  db.prepare(`SELECT c.id, c.subject, c.name, c.kind, c.before, c.after, c.at, p.id AS by_id, p.name AS by_name FROM tag_changes c LEFT JOIN people p ON p.id = c.actor ORDER BY c.id DESC LIMIT ${CHANGES_SHOWN}`)
export async function tagChanges(db: D1Database) {
  const { results } = await changesStatement(db).all<TagChange>()
  return results
}

// A write that lands only where it read: it stamps what it changes with the id its log row is about to take
// (`STAMP`), every statement after it in the batch runs only while that stamp stands, and the log row comes
// last. Nothing else writes in between, so a write refused by its guard changes nothing at all.
const LAST_CHANGE = "(SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'tag_changes'), 0))"
const STAMP = `(${LAST_CHANGE} + 1)`
const stamped = (slot: string) => `(SELECT rev FROM tags WHERE name = ${slot}) = ${STAMP}`
const groupStamped = (slot: string) => `(SELECT rev FROM tag_groups WHERE id = ${slot}) = ${STAMP}`
// A guard may name one more tag as ?8.
const logEntry = (db: D1Database, guard: string, name: string, kind: TagChangeKind, before: unknown, after: unknown, who: Who, subject: TagSubject = 'tag', other: string | null = null) =>
  db.prepare(`INSERT INTO tag_changes(id, subject, name, kind, before, after, actor, at) SELECT ${STAMP}, ?7, ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${guard}`)
    .bind(name, kind, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), who.actor, now(), subject, ...(other === null ? [] : [other]))

/** Runs a guarded batch, and answers whether it wrote: whether a log row was added. */
async function landed(db: D1Database, statements: D1PreparedStatement[]) {
  const results = await db.batch([db.prepare(`SELECT ${LAST_CHANGE} AS last`), ...statements, db.prepare(`SELECT ${LAST_CHANGE} AS last`)])
  const last = (result: D1Result | undefined) => (result?.results as { last: number }[] | undefined)?.[0]?.last ?? 0
  return last(results.at(-1)) > last(results[0])
}

const UP = (slot: string) => `up(name) AS (
  SELECT ${slot}
  UNION SELECT i.implies FROM tag_implications i JOIN up ON i.tag = up.name
)`
const DOWN = (slot: string) => `down(name) AS (
  SELECT ${slot}
  UNION SELECT i.tag FROM tag_implications i JOIN down ON i.implies = down.name
)`
const NEXT_POSITION = '(SELECT COALESCE(MAX(position) + 1, 0) FROM tags WHERE type = ?)'

export type NewTag = { name: string; type?: string | null; group?: number | null; implies?: readonly string[] }
export type TagCreateResult = { ok: true; value: string; created: boolean } | { ok: false; code: 'invalid' | 'target' | 'depth' | 'limit' | 'conflict' }

function inserted(db: D1Database, input: { name: string; label: string; type: TagType; group: number | null; implies: readonly string[]; position?: number }, who: Who, after: Record<string, unknown> = {}) {
  const targets = JSON.stringify(input.implies)
  return landed(db, [
    db.prepare(`INSERT OR IGNORE INTO tags(name, label, type, group_id, position, rev, created_by, created_at)
      SELECT ?1, ?2, ?3, ?7, COALESCE(?8, ${NEXT_POSITION.replace('?', '?3')}), ${STAMP}, ?4, ?5
      WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name IN (?1, ?2) OR label IN (?1, ?2))
        AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias IN (?1, ?2))
        AND (?7 IS NULL OR EXISTS (SELECT 1 FROM tag_groups WHERE id = ?7 AND type = ?3))
        AND (SELECT count(*) FROM json_each(?6) j WHERE EXISTS (SELECT 1 FROM tags WHERE name = j.value) AND j.value <> ?1) = json_array_length(?6)`)
      .bind(input.name, input.label, input.type, who.actor, now(), targets, input.group, input.position ?? null),
    ...(input.implies.length ? [
      db.prepare(`INSERT OR IGNORE INTO tag_implications(tag, implies)
        SELECT ?1, value FROM json_each(?2) WHERE ${stamped('?1')}`).bind(input.name, targets),
    ] : []),
    logEntry(db, stamped('?1'), input.name, 'create', null, { label: input.label, type: input.type, ...(input.group !== null ? { group: input.group } : {}), ...(input.implies.length ? { implies: input.implies } : {}), ...after }, who),
  ])
}

/**
 * Adds a tag with a type, optionally in one of the type's groups, and optional implied tags. An
 * existing tag's name or label resolves to that tag and adds nothing. A group decides the type.
 */
export async function createTag(db: D1Database, tags: readonly Tag[], input: NewTag, who: Who, groups: readonly TagGroup[] = []): Promise<TagCreateResult> {
  const value = cleanTag(input.name, tags)
  if (!value) return { ok: false, code: 'invalid' }
  if (tags.some(tag => tag.name === value)) return { ok: true, value, created: false }
  const group = input.group == null ? null : groups.find(item => item.id === input.group)
  if (group === undefined) return { ok: false, code: 'target' }
  const type = group ? group.type : input.type ? (isTagType(input.type) ? input.type : null) : 'general'
  if (!type) return { ok: false, code: 'invalid' }
  const implies = [...new Set((input.implies ?? []).map(item => item.normalize('NFC').trim()).filter(Boolean))]
  if (implies.length > TAG_IMPLIES_MAX) return { ok: false, code: 'limit' }
  if (implies.some(target => target === value || !tags.some(tag => tag.name === target))) return { ok: false, code: 'target' }
  const synthetic: Tag[] = [...tags, { name: value, label: value, type, group: group?.id ?? null, position: Number.MAX_SAFE_INTEGER, rev: 0, n: 0, implies: [], aliases: [] }]
  // Validate depth/closure bounds for every initial implication edge.
  for (const target of implies) {
    const refusal = canImply(synthetic, value, target)
    if (refusal === 'depth') return { ok: false, code: 'depth' }
    if (refusal === 'limit') return { ok: false, code: 'limit' }
    if (refusal) return { ok: false, code: 'target' }
    synthetic[synthetic.length - 1].implies.push(target)
  }
  return await inserted(db, { name: value, label: value, type, group: group?.id ?? null, implies }, who) ? { ok: true, value, created: true } : { ok: false, code: 'conflict' }
}

/** Gives every tag a record names that has no row yet a place under `general`, so each is typed and indexed. */
export async function ensureTags(db: D1Database, values: readonly string[], who: Who) {
  const named = [...new Set(values)]
  if (!named.length) return
  const missing = `SELECT value, key FROM json_each(?1) WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name = value OR label = value) AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias = value)`
  await db.batch([
    db.prepare(`INSERT INTO tag_changes(name, kind, before, after, actor, at) SELECT value, 'create', NULL, json_object('label', value, 'type', 'general'), ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
    db.prepare(`INSERT OR IGNORE INTO tags(name, label, type, position, created_by, created_at) SELECT value, value, 'general', ${NEXT_POSITION.replace('?', "'general'")} + key, ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
  ])
}

export type ChangeCode = 'missing' | 'invalid' | 'target' | 'cycle' | 'depth' | 'limit' | 'exists' | 'aliased' | 'used' | 'conflict' | 'too_large' | 'slow'
export type ChangeResult = { ok: true } | { ok: false; code: ChangeCode }
const refused = (code: ChangeCode): ChangeResult => ({ ok: false, code })
function current(tags: readonly Tag[], name: string, rev: number | undefined) {
  const found = tags.find(tag => tag.name === name)
  return !found ? 'missing' as const : rev !== undefined && rev !== found.rev ? 'conflict' as const : found
}
type Undo = { undo?: number }

/** A tag's display label changed; its canonical name, claims and implications stay. */
export async function renameTag(db: D1Database, tags: readonly Tag[], input: { name: string; label: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const label = input.label.normalize('NFC').trim()
  if (!validTagName(label)) return refused('invalid')
  if (label === found.label) return { ok: true }
  if (tags.some(tag => tag.name !== found.name && (tag.label === label || tag.name === label))) return refused('exists')
  if (tags.some(tag => tag.aliases.includes(label) && !(tag.name === found.name && label === found.name))) return refused('aliased')
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET label = ?2, rev = ${STAMP} WHERE name = ?1 AND rev = ?3 AND NOT EXISTS (SELECT 1 FROM tags WHERE name != ?1 AND (name = ?2 OR label = ?2)) AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?2)`).bind(found.name, label, found.rev),
    logEntry(db, stamped('?1'), found.name, 'rename', { label: found.label }, { label, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** Where a tag sits: its type, its group within the type, and its place among the tags beside it. */
export type Place = { type: TagType; group: number | null; index: number }
const shelf = (tags: readonly Tag[], type: TagType, group: number | null) => tags.filter(tag => tag.type === type && tag.group === group).sort(byTagOrder)
export const placeOf = (tags: readonly Tag[], tag: Tag): Place => ({ type: tag.type, group: tag.group, index: shelf(tags, tag.type, tag.group).findIndex(item => item.name === tag.name) })

/**
 * Puts a tag at `index` among the tags of a type, or of a group in it, which changes its color when the
 * type changes. A group decides the type; without an index the tag goes last.
 */
export async function moveTag(db: D1Database, tags: readonly Tag[], groups: readonly TagGroup[], input: { name: string; type?: string; group?: number | null; index?: number; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const group = input.group == null ? null : groups.find(item => item.id === input.group)
  if (group === undefined) return refused('target')
  const type = group ? group.type : input.type === undefined ? found.type : input.type
  if (!isTagType(type) || (group && input.type !== undefined && input.type !== group.type)) return refused('invalid')
  const others = shelf(tags, type, group?.id ?? null).filter(tag => tag.name !== found.name)
  const index = Math.max(0, Math.min(others.length, input.index === undefined || !Number.isSafeInteger(input.index) ? others.length : input.index))
  const from = placeOf(tags, found), to: Place = { type, group: group?.id ?? null, index }
  if (from.type === to.type && from.group === to.group && from.index === to.index) return { ok: true }
  const order = [...others.slice(0, index), found, ...others.slice(index)].map(tag => tag.name)
  const wrote = await landed(db, [
    // The tags it lands among must stand in the order read, so two moves from one read cannot interleave.
    db.prepare(`UPDATE tags SET type = ?2, group_id = ?3, rev = ${STAMP} WHERE name = ?1 AND rev = ?4 AND (?3 IS NULL OR EXISTS (SELECT 1 FROM tag_groups WHERE id = ?3 AND type = ?2))
      AND (SELECT json_group_array(name) FROM (SELECT name FROM tags WHERE group_id IS ?3 AND type = ?2 AND name <> ?1 ORDER BY position, name)) = ?5`)
      .bind(found.name, type, to.group, found.rev, JSON.stringify(others.map(tag => tag.name))),
    db.prepare(`UPDATE tags SET position = (SELECT key FROM json_each(?2) WHERE value = tags.name) WHERE name IN (SELECT value FROM json_each(?2)) AND ${stamped('?1')}`)
      .bind(found.name, JSON.stringify(order)),
    logEntry(db, stamped('?1'), found.name, 'move', from, { ...to, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The records filed under a tag or any tag that implies it, live ones only: a hidden or merged record
// holds no rows to list it by.
// The tags below each tag in the JSON array `?2`.
const MOVED = `WITH RECURSIVE down(name) AS (
  SELECT value FROM json_each(?2)
  UNION SELECT i.tag FROM tag_implications i JOIN down ON i.implies = down.name
), moved(entry_id) AS (
  SELECT cl.entry_id FROM claims cl JOIN entries e ON e.id = cl.entry_id
  WHERE cl.kind = 'tag' AND cl.value IN (SELECT name FROM down UNION ALL SELECT a.alias FROM down CROSS JOIN tag_aliases a ON a.tag = down.name)
    AND e.merged_into IS NULL AND e.hidden_at IS NULL
)`
/**
 * A record's tag rows, as `up(entry_id, name)`: each tag its claims name, an alias standing for its tag,
 * and every tag transitively implied by them, read from `tags`, `tag_aliases` and `tag_implications` as
 * the batch that writes them runs.
 */
export const filedUnder = (records: string) => `up(entry_id, name) AS (
  SELECT cl.entry_id, COALESCE((SELECT a.tag FROM tag_aliases a WHERE a.alias = cl.value), cl.value) FROM claims cl WHERE +cl.kind = 'tag' AND cl.entry_id ${records}
  UNION SELECT up.entry_id, i.implies FROM up JOIN tag_implications i ON i.tag = up.name
)`
/** Writes a record's tag rows from `up`, each with the record's sightings and year. */
export const FILE_ROWS = "INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year) SELECT 't:' || up.name, up.entry_id, e.sightings, CAST(e.first_year AS INTEGER) FROM up CROSS JOIN entries e ON e.id = up.entry_id"
const FILED = `, ${filedUnder('IN (SELECT entry_id FROM moved)')}`
const MOVED_ROWS = "SELECT tag, entry_id FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 't:' AND tag < 't;'"

/**
 * The statements that file every record under a tag (and anything implying it) again after an
 * implication changes, and the records under each tag of `also` with them. Each runs only while the
 * tag's stamp stands.
 */
export function refileStatements(db: D1Database, name: string, also: readonly string[] = []) {
  const guard = stamped('?1'), more = JSON.stringify([name, ...also])
  return [
    db.prepare(`${MOVED}, rows AS (${MOVED_ROWS}) UPDATE tag_counts SET n = n - (SELECT count(*) FROM rows WHERE rows.tag = tag_counts.tag) WHERE tag IN (SELECT tag FROM rows) AND ${guard}`).bind(name, more),
    db.prepare(`${MOVED} DELETE FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 't:' AND tag < 't;' AND ${guard}`).bind(name, more),
    db.prepare(`${MOVED}${FILED} ${FILE_ROWS} WHERE ${guard}`).bind(name, more),
    db.prepare(`${MOVED} INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM (${MOVED_ROWS}) WHERE ${guard} GROUP BY tag ON CONFLICT(tag) DO UPDATE SET n = n + excluded.n`).bind(name, more),
  ]
}

export const MOVE_RECORDS_MAX = 1000
export const MOVES_PER_HOUR = 20
export const moveSizeStatement = (db: D1Database, name: string) => db.prepare("SELECT COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?), 0) AS n").bind(name)
const RECENT_MOVES = (actor: string, since: string) => `(SELECT count(*) FROM (SELECT 1 FROM tag_changes WHERE actor = ${actor} AND kind IN ('imply','unimply','merge','split') AND at > ${since} AND json_extract(after, '$.undo') IS NULL LIMIT ${MOVES_PER_HOUR}))`
export const recentMovesStatement = (db: D1Database, actor: string, since: string) => db.prepare(`SELECT ${RECENT_MOVES('?1', '?2')} AS n`).bind(actor, since)

/**
 * Adds an implication `name -> target` so every record carrying `name` (directly or transitively) also
 * carries `target` and everything `target` implies. Refuses cycles, depth/closure bounds, and oversized
 * refiles.
 */
export async function implyTag(db: D1Database, tags: readonly Tag[], input: { name: string; target: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const target = input.target.normalize('NFC').trim()
  const refusal = canImply(tags, found.name, target)
  if (refusal === 'missing') return refused('target')
  if (refusal === 'self' || refusal === 'cycle') return refused('cycle')
  if (refusal === 'exists') return { ok: true }
  if (refusal) return refused(refusal)
  const since = new Date(Date.now() - 3600_000).toISOString(), limited = !input.undo
  const [size, recent] = await Promise.all([moveSizeStatement(db, found.name).first<{ n: number }>(), recentMovesStatement(db, who.actor, since).first<{ n: number }>()])
  if ((size?.n ?? 0) > MOVE_RECORDS_MAX) return refused('too_large')
  if (limited && (recent?.n ?? 0) >= MOVES_PER_HOUR) return refused('slow')
  const wrote = await landed(db, [
    db.prepare(`WITH RECURSIVE ${UP('?2')}, ${DOWN('?1')}
      UPDATE tags SET rev = ${STAMP}
      WHERE name = ?1 AND rev = ?3
        AND EXISTS (SELECT 1 FROM tags WHERE name = ?2)
        AND NOT EXISTS (SELECT 1 FROM tag_implications WHERE tag = ?1 AND implies = ?2)
        AND NOT EXISTS (SELECT 1 FROM up WHERE name = ?1)
        AND (SELECT count(*) FROM tag_implications WHERE tag = ?1) < ${TAG_IMPLIES_MAX}
        AND (SELECT count(*) FROM up) + (SELECT count(*) FROM down) <= ${TAG_CLOSURE_MAX}
        AND COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?1), 0) <= ${MOVE_RECORDS_MAX}
        AND (NOT ?6 OR ${RECENT_MOVES('?4', '?5')} < ${MOVES_PER_HOUR})`).bind(found.name, target, found.rev, who.actor, since, limited ? 1 : 0),
    db.prepare(`INSERT INTO tag_implications(tag, implies) SELECT ?1, ?2 WHERE ${stamped('?1')}`).bind(found.name, target),
    ...refileStatements(db, found.name),
    logEntry(db, stamped('?1'), found.name, 'imply', null, { implies: target, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/**
 * Removes an implication `name -> target` and refiles every affected record so tags still implied
 * via other paths stay and those no longer implied are removed.
 */
export async function unimplyTag(db: D1Database, tags: readonly Tag[], input: { name: string; target: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const target = input.target.normalize('NFC').trim()
  if (!found.implies.includes(target)) return refused('missing')
  const since = new Date(Date.now() - 3600_000).toISOString(), limited = !input.undo
  const [size, recent] = await Promise.all([moveSizeStatement(db, found.name).first<{ n: number }>(), recentMovesStatement(db, who.actor, since).first<{ n: number }>()])
  if ((size?.n ?? 0) > MOVE_RECORDS_MAX) return refused('too_large')
  if (limited && (recent?.n ?? 0) >= MOVES_PER_HOUR) return refused('slow')
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET rev = ${STAMP}
      WHERE name = ?1 AND rev = ?3
        AND EXISTS (SELECT 1 FROM tag_implications WHERE tag = ?1 AND implies = ?2)
        AND COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?1), 0) <= ${MOVE_RECORDS_MAX}
        AND (NOT ?6 OR ${RECENT_MOVES('?4', '?5')} < ${MOVES_PER_HOUR})`).bind(found.name, target, found.rev, who.actor, since, limited ? 1 : 0),
    db.prepare(`DELETE FROM tag_implications WHERE tag = ?1 AND implies = ?2 AND ${stamped('?1')}`).bind(found.name, target),
    ...refileStatements(db, found.name),
    logEntry(db, stamped('?1'), found.name, 'unimply', { implies: target }, input.undo ? { undo: input.undo } : null, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** A tag no record names and no other tag implies goes (along with any outgoing implications it held). */
export async function deleteTag(db: D1Database, tags: readonly Tag[], input: { name: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const unused = "NOT EXISTS (SELECT 1 FROM tag_implications WHERE implies = ?1) AND NOT EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = ?1) AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE tag = ?1)"
  const free = await db.prepare(`SELECT ${unused} AS free`).bind(found.name).first<{ free: number }>()
  if (!free?.free) return refused('used')
  const guard = `EXISTS (SELECT 1 FROM tags WHERE name = ?1 AND rev = ?7) AND ${unused}`
  const before = { label: found.label, type: found.type, position: found.position, ...(found.group !== null ? { group: found.group } : {}), ...(found.implies.length ? { implies: found.implies } : {}) }
  const wrote = await landed(db, [
    db.prepare(`INSERT INTO tag_changes(id, name, kind, before, after, actor, at) SELECT ${STAMP}, ?1, 'delete', ?2, ?3, ?4, ?5 WHERE ${guard.replace('?7', '?6')}`)
      .bind(found.name, JSON.stringify(before), input.undo ? JSON.stringify({ undo: input.undo }) : null, who.actor, now(), found.rev),
    db.prepare(`DELETE FROM tag_implications WHERE tag = ?1 AND EXISTS (SELECT 1 FROM tags WHERE name = ?1 AND rev = ?2) AND ${unused}`).bind(found.name, found.rev),
    db.prepare(`DELETE FROM tags WHERE name = ?1 AND rev = ?2 AND ${unused}`).bind(found.name, found.rev),
    db.prepare("DELETE FROM tag_counts WHERE tag = 't:' || ?1 AND n <= 0 AND NOT EXISTS (SELECT 1 FROM tags WHERE name = ?1)").bind(found.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// Merging and aliases. A merged tag's name becomes an alias of the tag it went into: records that name it
// keep their claims as written and are filed under that tag, so their history stays as it was.
type Edge = [string, string]
const ownerOf = (tags: readonly Tag[], alias: string) => tags.find(tag => tag.aliases.includes(alias))
// The edges of `graph` that `edges` can join without a cycle or passing the bounds, added to it in turn.
function joinable(graph: Tag[], edges: readonly Edge[]) {
  const kept: Edge[] = []
  for (const [from, to] of edges) {
    const node = graph.find(tag => tag.name === from)
    if (!node || canImply(graph, from, to) !== null) continue
    node.implies = [...node.implies, to]
    kept.push([from, to])
  }
  return kept
}
// Whether the implications as they stand, less the edges of tag `gone` and the edges in `removed`, plus
// the edges in `added` (JSON arrays of [tag, implies]), stay free of cycles. Checked as the batch runs,
// so a change made elsewhere since the read cannot close a cycle.
const acyclic = (added: string, removed: string, gone: string) => `NOT EXISTS (
  WITH RECURSIVE extra(tag, implies) AS (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(${added})),
  reach(source, name) AS (
    SELECT tag, implies FROM extra
    UNION SELECT reach.source, i.implies FROM reach JOIN tag_implications i ON i.tag = reach.name
      WHERE i.implies <> ${gone} AND i.tag <> ${gone}
        AND NOT EXISTS (SELECT 1 FROM json_each(${removed}) r WHERE json_extract(r.value, '$[0]') = i.tag AND json_extract(r.value, '$[1]') = i.implies)
    UNION SELECT reach.source, extra.implies FROM reach JOIN extra ON extra.tag = reach.name
  )
  SELECT 1 FROM reach WHERE reach.name = reach.source
)`
const copied = (tags: readonly Tag[]) => tags.map(tag => ({ ...tag, implies: [...tag.implies], aliases: [...tag.aliases] }))
async function moveAllowance(db: D1Database, names: readonly string[], who: Who, limited: boolean) {
  const since = new Date(Date.now() - 3600_000).toISOString()
  const [sizes, recent] = await Promise.all([
    Promise.all(names.map(name => moveSizeStatement(db, name).first<{ n: number }>())),
    recentMovesStatement(db, who.actor, since).first<{ n: number }>(),
  ])
  if (sizes.reduce((sum, size) => sum + (size?.n ?? 0), 0) > MOVE_RECORDS_MAX) return 'too_large' as const
  if (limited && (recent?.n ?? 0) >= MOVES_PER_HOUR) return 'slow' as const
  return null
}

type MergedState = { label: string; type: TagType; group: number | null; position: number; implies: string[]; impliedBy: string[]; aliases: string[] }

/**
 * Merges a tag into another: the records that name it, its aliases and its implications pass to the other
 * tag, and its name stays as an alias of that tag. An implication that would close a cycle is dropped.
 */
export async function mergeTag(db: D1Database, tags: readonly Tag[], input: { name: string; into: string; rev?: number; intoRev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const into = current(tags, input.into, input.intoRev)
  if (into === 'missing') return refused('target')
  if (typeof into === 'string') return refused(into)
  if (into.name === found.name) return refused('invalid')
  if (into.aliases.length + found.aliases.length + 1 > TAG_ALIASES_MAX) return refused('limit')
  const impliedBy = tags.filter(tag => tag.implies.includes(found.name)).map(tag => tag.name)
  const graph = copied(tags.filter(tag => tag.name !== found.name)).map(tag => ({ ...tag, implies: tag.implies.filter(target => target !== found.name) }))
  const added = joinable(graph, [
    ...found.implies.filter(target => target !== into.name).map((target): Edge => [into.name, target]),
    ...impliedBy.filter(name => name !== into.name).map((name): Edge => [name, into.name]),
  ])
  const refusal = await moveAllowance(db, [found.name, into.name], who, !input.undo)
  if (refusal) return refused(refusal)
  const before: MergedState = { label: found.label, type: found.type, group: found.group, position: found.position, implies: found.implies, impliedBy, aliases: found.aliases }
  const both = `${stamped('?1')} AND ${stamped('?2')}`
  const since = new Date(Date.now() - 3600_000).toISOString(), limited = input.undo ? 0 : 1
  // Every condition sits in the first write, so a refused merge leaves no stamp behind. The tags that
  // implied the merged one must be the ones read: their records are refiled from them.
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET rev = ${STAMP} WHERE name = ?1 AND rev = ?2
      AND EXISTS (SELECT 1 FROM tags WHERE name = ?6 AND rev = ?7)
      AND COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?1), 0) + COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?6), 0) <= ${MOVE_RECORDS_MAX}
      AND (NOT ?5 OR ${RECENT_MOVES('?3', '?4')} < ${MOVES_PER_HOUR})
      AND (SELECT json_group_array(tag) FROM (SELECT tag FROM tag_implications WHERE implies = ?1 ORDER BY tag)) = ?8
      AND ${acyclic('?9', "'[]'", '?1')}`).bind(found.name, found.rev, who.actor, since, limited, into.name, into.rev, JSON.stringify([...impliedBy].sort()), JSON.stringify(added)),
    db.prepare(`UPDATE tags SET rev = ${STAMP} WHERE name = ?2 AND rev = ?3 AND ${stamped('?1')}`).bind(found.name, into.name, into.rev),
    db.prepare(`DELETE FROM tag_implications WHERE tag = ?1 AND ${both}`).bind(found.name, into.name),
    db.prepare(`DELETE FROM tag_implications WHERE implies = ?1 AND ${both}`).bind(found.name, into.name),
    ...(added.length ? [db.prepare(`INSERT OR IGNORE INTO tag_implications(tag, implies) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?3) WHERE ${both}`).bind(found.name, into.name, JSON.stringify(added))] : []),
    db.prepare(`UPDATE tag_aliases SET tag = ?2 WHERE tag = ?1 AND ${both}`).bind(found.name, into.name),
    db.prepare(`INSERT INTO tag_aliases(alias, tag, created_by, created_at) SELECT ?1, ?2, ?3, ?4 WHERE ${both}`).bind(found.name, into.name, who.actor, now()),
    // Records filed through an implication of the merged tag that could not move to the other tag are
    // refiled too: they sit under the tags that implied it.
    ...refileStatements(db, into.name, impliedBy),
    db.prepare(`DELETE FROM tags WHERE name = ?1 AND ${both}`).bind(found.name, into.name),
    db.prepare("DELETE FROM tag_counts WHERE tag = 't:' || ?1 AND n <= 0 AND NOT EXISTS (SELECT 1 FROM tags WHERE name = ?1)").bind(found.name),
    logEntry(db, `${stamped('?8')} AND EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?1 AND tag = ?8) AND NOT EXISTS (SELECT 1 FROM tags WHERE name = ?1)`, found.name, 'merge', before, { into: into.name, added, ...(input.undo ? { undo: input.undo } : {}) }, who, 'tag', into.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/**
 * Turns an alias back into a tag of its own, beside the tag it pointed to, and refiles the records that
 * name it. Undoing a merge passes the merged tag's state, and the implications the merge gave the other
 * tag go again.
 */
export async function splitTag(db: D1Database, tags: readonly Tag[], groups: readonly TagGroup[], input: { alias: string; restore?: { before: Partial<MergedState>; added: Edge[] } } & Undo, who: Who): Promise<ChangeResult> {
  const owner = ownerOf(tags, input.alias)
  if (!owner) return refused('missing')
  const before = input.restore?.before ?? {}
  const taken = (label: string) => tags.some(tag => tag.name === label || tag.label === label || (tag.aliases.includes(label) && label !== input.alias))
  const label = before.label && validTagName(before.label) && !taken(before.label) ? before.label : input.alias
  const group = typeof before.group === 'number' ? groups.find(item => item.id === before.group && (!before.type || item.type === before.type)) ?? null : null
  const place = before.type && isTagType(before.type) ? { type: before.type, group: group?.id ?? null } : { type: owner.type, group: owner.group }
  const removed = (input.restore?.added ?? []).filter(([from, to]) => tags.find(tag => tag.name === from)?.implies.includes(to))
  const graph = copied(tags).map(tag => ({ ...tag, implies: tag.implies.filter(target => !removed.some(([from, to]) => from === tag.name && to === target)) }))
  graph.push({ name: input.alias, label, ...place, position: Number.MAX_SAFE_INTEGER, rev: 0, n: 0, implies: [], aliases: [] })
  const restored = joinable(graph, [
    ...(before.implies ?? []).map((target): Edge => [input.alias, target]),
    ...(before.impliedBy ?? []).map((name): Edge => [name, input.alias]),
  ])
  const returning = (before.aliases ?? []).filter(alias => owner.aliases.includes(alias))
  const refusal = await moveAllowance(db, [owner.name], who, !input.undo)
  if (refusal) return refused(refusal)
  const own = stamped('?1')
  const wrote = await landed(db, [
    // Every condition sits in the first write, so a refused split leaves no stamp behind.
    db.prepare(`UPDATE tags SET rev = ${STAMP} WHERE name = ?1 AND rev = ?2 AND EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?3 AND tag = ?1)
      AND NOT EXISTS (SELECT 1 FROM tags WHERE name IN (?3, ?4) OR label IN (?3, ?4)) AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?4 AND alias <> ?3)
      AND (?5 IS NULL OR EXISTS (SELECT 1 FROM tag_groups WHERE id = ?5 AND type = ?6))
      AND ${acyclic('?7', '?8', "''")}`)
      .bind(owner.name, owner.rev, input.alias, label, place.group, place.type, JSON.stringify(restored), JSON.stringify(removed)),
    db.prepare(`INSERT INTO tags(name, label, type, group_id, position, rev, created_by, created_at)
      SELECT ?1, ?2, ?3, ?4, COALESCE(?5, ${NEXT_POSITION.replace('?', '?3')}), ${STAMP}, ?6, ?7 WHERE ${stamped('?8')}`)
      .bind(input.alias, label, place.type, place.group, typeof before.position === 'number' ? before.position : null, who.actor, now(), owner.name),
    db.prepare(`DELETE FROM tag_aliases WHERE alias = ?1 AND ${own}`).bind(input.alias),
    ...(returning.length ? [db.prepare(`UPDATE tag_aliases SET tag = ?1 WHERE tag = ?2 AND alias IN (SELECT value FROM json_each(?3)) AND ${own}`).bind(input.alias, owner.name, JSON.stringify(returning))] : []),
    ...removed.map(([from, to]) => db.prepare(`DELETE FROM tag_implications WHERE tag = ?2 AND implies = ?3 AND ${own}`).bind(input.alias, from, to)),
    ...(restored.length ? [db.prepare(`INSERT OR IGNORE INTO tag_implications(tag, implies) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2) WHERE ${own}`).bind(input.alias, JSON.stringify(restored))] : []),
    ...refileStatements(db, owner.name, removed.map(([from]) => from)),
    ...refileStatements(db, input.alias),
    logEntry(db, own, input.alias, 'split', { tag: owner.name }, { label, ...place, ...(restored.length ? { implies: restored } : {}), ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** Gives a tag another name it is found by. A name another tag already has is merged instead. */
export async function aliasTag(db: D1Database, tags: readonly Tag[], input: { name: string; alias: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const alias = input.alias.normalize('NFC').trim().replace(/^#+/, '').trim()
  if (!validTagName(alias)) return refused('invalid')
  if (tags.some(tag => tag.name === alias || tag.label === alias)) return refused('exists')
  if (ownerOf(tags, alias)) return refused('aliased')
  if (found.aliases.length >= TAG_ALIASES_MAX) return refused('limit')
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET rev = ${STAMP} WHERE name = ?1 AND rev = ?2
      AND NOT EXISTS (SELECT 1 FROM tags WHERE name = ?3 OR label = ?3) AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?3)`).bind(found.name, found.rev, alias),
    db.prepare(`INSERT INTO tag_aliases(alias, tag, created_by, created_at) SELECT ?1, ?2, ?3, ?4 WHERE ${stamped('?2')}`).bind(alias, found.name, who.actor, now()),
    logEntry(db, `${stamped('?8')} AND EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?1 AND tag = ?8)`, alias, 'alias', null, { tag: found.name, ...(input.undo ? { undo: input.undo } : {}) }, who, 'tag', found.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/**
 * Takes a name off the tag it is an alias of. A name records still use becomes a tag of its own again,
 * so those records stay filed under it.
 */
export async function unaliasTag(db: D1Database, tags: readonly Tag[], groups: readonly TagGroup[], input: { alias: string } & Undo, who: Who): Promise<ChangeResult> {
  const owner = ownerOf(tags, input.alias)
  if (!owner) return refused('missing')
  const named = await db.prepare("SELECT EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = ?) AS used").bind(input.alias).first<{ used: number }>()
  if (named?.used) return splitTag(db, tags, groups, input, who)
  const unnamed = "NOT EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = ?1)"
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET rev = ${STAMP} WHERE name = ?2 AND rev = ?3 AND EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?1 AND tag = ?2) AND ${unnamed}`).bind(input.alias, owner.name, owner.rev),
    db.prepare(`DELETE FROM tag_aliases WHERE alias = ?1 AND ${stamped('?2')}`).bind(input.alias, owner.name),
    logEntry(db, `${stamped('?8')} AND NOT EXISTS (SELECT 1 FROM tag_aliases WHERE alias = ?1)`, input.alias, 'unalias', { tag: owner.name }, input.undo ? { undo: input.undo } : null, who, 'tag', owner.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The groups: the middle tier. A group's changes are logged beside the tags', under its id.
type GroupResult = { ok: true; id: number } | { ok: false; code: ChangeCode }
function currentGroup(groups: readonly TagGroup[], id: number, rev: number | undefined) {
  const found = groups.find(group => group.id === id)
  return !found ? 'missing' as const : rev !== undefined && rev !== found.rev ? 'conflict' as const : found
}
const groupShelf = (groups: readonly TagGroup[], type: TagType) => groups.filter(group => group.type === type).sort(byGroupOrder)
const groupPlace = (groups: readonly TagGroup[], group: TagGroup) => ({ type: group.type, index: groupShelf(groups, group.type).findIndex(item => item.id === group.id) })

/** Adds a group to a type, last among its groups, or back at the id and place it had when undoing. */
export async function createGroup(db: D1Database, groups: readonly TagGroup[], input: { type: string; label: string; id?: number; position?: number } & Undo, who: Who): Promise<GroupResult> {
  const label = input.label.normalize('NFC').trim()
  if (!isTagType(input.type) || !validGroupLabel(label)) return { ok: false, code: 'invalid' }
  if (groups.some(group => group.type === input.type && group.label === label)) return { ok: false, code: 'exists' }
  if (groups.length >= GROUPS_MAX) return { ok: false, code: 'limit' }
  const made = `SELECT id FROM tag_groups WHERE type = ?1 AND label = ?2 AND rev = ${STAMP}`
  const wrote = await landed(db, [
    db.prepare(`INSERT INTO tag_groups(id, type, label, position, rev, created_by, created_at)
      SELECT ?3, ?1, ?2, COALESCE(?4, (SELECT COALESCE(MAX(position) + 1, 0) FROM tag_groups WHERE type = ?1)), ${STAMP}, ?5, ?6
      WHERE NOT EXISTS (SELECT 1 FROM tag_groups WHERE type = ?1 AND label = ?2) AND (?3 IS NULL OR NOT EXISTS (SELECT 1 FROM tag_groups WHERE id = ?3))`)
      .bind(input.type, label, input.id ?? null, input.position ?? null, who.actor, now()),
    db.prepare(`INSERT INTO tag_changes(id, subject, name, kind, before, after, actor, at) SELECT ${STAMP}, 'group', CAST(id AS TEXT), 'create', NULL, ?3, ?4, ?5 FROM (${made})`)
      .bind(input.type, label, JSON.stringify({ type: input.type, label, ...(input.undo ? { undo: input.undo } : {}) }), who.actor, now()),
  ])
  if (!wrote) return { ok: false, code: 'conflict' }
  const row = await db.prepare('SELECT id FROM tag_groups WHERE type = ? AND label = ?').bind(input.type, label).first<{ id: number }>()
  return row ? { ok: true, id: row.id } : { ok: false, code: 'conflict' }
}

/** A group's name changed; its tags stay in it. */
export async function renameGroup(db: D1Database, groups: readonly TagGroup[], input: { id: number; label: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = currentGroup(groups, input.id, input.rev)
  if (typeof found === 'string') return refused(found)
  const label = input.label.normalize('NFC').trim()
  if (!validGroupLabel(label)) return refused('invalid')
  if (label === found.label) return { ok: true }
  if (groups.some(group => group.id !== found.id && group.type === found.type && group.label === label)) return refused('exists')
  const wrote = await landed(db, [
    db.prepare(`UPDATE tag_groups SET label = ?2, rev = ${STAMP} WHERE id = ?1 AND rev = ?3 AND NOT EXISTS (SELECT 1 FROM tag_groups WHERE type = ?4 AND label = ?2)`).bind(found.id, label, found.rev, found.type),
    logEntry(db, groupStamped('?1'), String(found.id), 'rename', { label: found.label }, { label, ...(input.undo ? { undo: input.undo } : {}) }, who, 'group'),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/**
 * Puts a group at `index` among the groups of a type. A group moved to another type takes its tags
 * with it, and they change color with it.
 */
export async function moveGroup(db: D1Database, groups: readonly TagGroup[], input: { id: number; type?: string; index?: number; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = currentGroup(groups, input.id, input.rev)
  if (typeof found === 'string') return refused(found)
  const type = input.type === undefined ? found.type : input.type
  if (!isTagType(type)) return refused('invalid')
  if (type !== found.type && groups.some(group => group.type === type && group.label === found.label)) return refused('exists')
  const others = groupShelf(groups, type).filter(group => group.id !== found.id)
  const index = Math.max(0, Math.min(others.length, input.index === undefined || !Number.isSafeInteger(input.index) ? others.length : input.index))
  const from = groupPlace(groups, found), to = { type, index }
  if (from.type === to.type && from.index === to.index) return { ok: true }
  const order = [...others.slice(0, index), found, ...others.slice(index)].map(group => group.id)
  const guard = groupStamped('?1')
  const wrote = await landed(db, [
    db.prepare(`UPDATE tag_groups SET type = ?2, rev = ${STAMP} WHERE id = ?1 AND rev = ?3 AND NOT EXISTS (SELECT 1 FROM tag_groups WHERE type = ?2 AND label = ?4 AND id <> ?1)
      AND (SELECT json_group_array(id) FROM (SELECT id FROM tag_groups WHERE type = ?2 AND id <> ?1 ORDER BY position, id)) = ?5`).bind(found.id, type, found.rev, found.label, JSON.stringify(others.map(group => group.id))),
    db.prepare(`UPDATE tag_groups SET position = (SELECT key FROM json_each(?2) WHERE value = tag_groups.id) WHERE id IN (SELECT value FROM json_each(?2)) AND ${guard}`).bind(found.id, JSON.stringify(order)),
    db.prepare(`UPDATE tags SET type = ?2, rev = ${STAMP} WHERE group_id = ?1 AND type <> ?2 AND ${guard}`).bind(found.id, type),
    logEntry(db, guard, String(found.id), 'move', from, { ...to, ...(input.undo ? { undo: input.undo } : {}) }, who, 'group'),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** An empty group goes. */
export async function deleteGroup(db: D1Database, groups: readonly TagGroup[], input: { id: number; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = currentGroup(groups, input.id, input.rev)
  if (typeof found === 'string') return refused(found)
  const empty = await db.prepare('SELECT NOT EXISTS (SELECT 1 FROM tags WHERE group_id = ?) AS empty').bind(found.id).first<{ empty: number }>()
  if (!empty?.empty) return refused('used')
  const guard = 'EXISTS (SELECT 1 FROM tag_groups WHERE id = ?1 AND rev = ?2) AND NOT EXISTS (SELECT 1 FROM tags WHERE group_id = ?1)'
  const wrote = await landed(db, [
    db.prepare(`INSERT INTO tag_changes(id, subject, name, kind, before, after, actor, at) SELECT ${STAMP}, 'group', CAST(?1 AS TEXT), 'delete', ?3, ?4, ?5, ?6 WHERE ${guard}`)
      .bind(found.id, found.rev, JSON.stringify({ type: found.type, label: found.label, position: found.position }), input.undo ? JSON.stringify({ undo: input.undo }) : null, who.actor, now()),
    db.prepare(`DELETE FROM tag_groups WHERE id = ?1 AND rev = ?2 AND NOT EXISTS (SELECT 1 FROM tags WHERE group_id = ?1)`).bind(found.id, found.rev),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The latest change of a tag or a group, read from the end of its range of the log.
export const latestChangeStatement = (db: D1Database, name: string, subject: TagSubject = 'tag') => db.prepare('SELECT MAX(id) AS id FROM tag_changes WHERE subject = ? AND name = ?').bind(subject, name)

type Logged = { label?: string; type?: string; group?: number | null; index?: number; position?: number; implies?: string[] | string; impliedBy?: string[]; aliases?: string[]; tag?: string; into?: string; added?: Edge[] }
const placeFrom = (logged: Logged) => ({ type: logged.type, group: typeof logged.group === 'number' ? logged.group : null, index: logged.index })

/**
 * Undoes the latest change of a tag or a group by applying its inverse through the same guarded writes.
 */
export async function undoTagChange(db: D1Database, state: { tags: readonly Tag[]; groups: readonly TagGroup[] }, id: number, who: Who): Promise<ChangeResult> {
  const { tags, groups } = state
  const change = await db.prepare('SELECT id, subject, name, kind, before, after FROM tag_changes WHERE id = ?').bind(id).first<{ id: number; subject: TagSubject; name: string; kind: TagChangeKind; before: string | null; after: string | null }>()
  if (!change) return refused('missing')
  const latest = await latestChangeStatement(db, change.name, change.subject).first<{ id: number }>()
  if (latest?.id !== change.id) return refused('conflict')
  let before: Logged = {}
  let after: Logged = {}
  try {
    before = change.before ? JSON.parse(change.before) : {}
    after = change.after ? JSON.parse(change.after) : {}
  } catch { return refused('invalid') }
  if (change.subject === 'group') {
    const groupId = Number(change.name)
    const rev = groups.find(group => group.id === groupId)?.rev
    switch (change.kind) {
      case 'create': return deleteGroup(db, groups, { id: groupId, rev, undo: id }, who)
      case 'rename': return renameGroup(db, groups, { id: groupId, label: before.label ?? '', rev, undo: id }, who)
      case 'move': return moveGroup(db, groups, { id: groupId, type: before.type, index: before.index, rev, undo: id }, who)
      case 'delete': {
        const made = await createGroup(db, groups, { type: before.type ?? '', label: before.label ?? '', id: groupId, position: before.position, undo: id }, who)
        return made.ok ? { ok: true } : made
      }
      default: return refused('invalid')
    }
  }
  const rev = tags.find(tag => tag.name === change.name)?.rev
  const known = (group: number | null) => group !== null && groups.some(item => item.id === group) ? group : null
  switch (change.kind) {
    case 'rename': return renameTag(db, tags, { name: change.name, label: before.label ?? change.name, rev, undo: id }, who)
    case 'retype': return moveTag(db, tags, groups, { name: change.name, type: before.type ?? 'general', group: null, rev, undo: id }, who)
    case 'move': {
      const place = placeFrom(before), group = known(place.group)
      return moveTag(db, tags, groups, { name: change.name, ...(group === null ? { type: place.type ?? 'general' } : {}), group, index: place.index, rev, undo: id }, who)
    }
    case 'imply': return typeof after.implies === 'string' ? unimplyTag(db, tags, { name: change.name, target: after.implies, rev, undo: id }, who) : refused('invalid')
    case 'unimply': return typeof before.implies === 'string' ? implyTag(db, tags, { name: change.name, target: before.implies, rev, undo: id }, who) : refused('invalid')
    case 'merge': {
      const added = Array.isArray(after.added) ? after.added.filter((edge): edge is Edge => Array.isArray(edge) && edge.length === 2 && edge.every(item => typeof item === 'string')) : []
      const restore = { before: { ...before, type: isTagType(before.type) ? before.type : undefined, implies: Array.isArray(before.implies) ? before.implies : [] }, added }
      return splitTag(db, tags, groups, { alias: change.name, restore, undo: id }, who)
    }
    case 'split': return typeof before.tag === 'string' ? mergeTag(db, tags, { name: change.name, into: before.tag, undo: id }, who) : refused('invalid')
    case 'alias': return unaliasTag(db, tags, groups, { alias: change.name, undo: id }, who)
    case 'unalias': return typeof before.tag === 'string' ? aliasTag(db, tags, { name: before.tag, alias: change.name, undo: id }, who) : refused('invalid')
    case 'create': return deleteTag(db, tags, { name: change.name, rev, undo: id }, who)
    case 'delete': {
      const label = before.label ?? change.name
      const type = isTagType(before.type) ? before.type : 'general'
      const group = known(typeof before.group === 'number' ? before.group : null)
      const implies = Array.isArray(before.implies) ? before.implies.filter(target => tags.some(tag => tag.name === target)) : []
      if (tags.some(tag => [tag.name, tag.label].some(taken => taken === change.name || taken === label))) return refused('exists')
      return await inserted(db, { name: change.name, label, type: group === null ? type : groups.find(item => item.id === group)!.type, group, implies, position: before.position }, who, { undo: id }) ? { ok: true } : refused('conflict')
    }
    default: return refused('invalid')
  }
}
