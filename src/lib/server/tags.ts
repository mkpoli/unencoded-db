import { TAG_CLOSURE_MAX, TAG_IMPLIES_MAX, canImply, cleanTag, isTagType, validTagName, type Tag, type TagType } from '$lib/tags'

type Who = { actor: string; ip: string | null }
const now = () => new Date().toISOString()

// Every tag with the records filed under it (directly or via implications): the table in type/position
// order, the counts looked up by key, and capped. `used` asks, by the claims index, whether any record
// names each one directly, hidden and merged records too.
export const TAGS_MAX = 1000
export const tagsStatement = (db: D1Database, used = false) =>
  db.prepare(`SELECT c.name, c.label, c.type, c.position, c.rev, COALESCE(t.n, 0) AS n${used ? ", EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = c.name) AS used" : ''} FROM tags c LEFT JOIN tag_counts t ON t.tag = 't:' || c.name ORDER BY c.type, c.position, c.name LIMIT ${TAGS_MAX}`)
export const implicationsStatement = (db: D1Database) =>
  db.prepare(`SELECT tag, implies FROM tag_implications ORDER BY tag, implies LIMIT ${TAGS_MAX * TAG_IMPLIES_MAX}`)

export async function tagList(db: D1Database, used = false): Promise<Tag[]> {
  const [rows, edges] = await db.batch<Record<string, unknown>>([tagsStatement(db, used), implicationsStatement(db)])
  const impliesMap = new Map<string, string[]>()
  for (const row of edges.results as { tag: string; implies: string }[]) {
    impliesMap.set(row.tag, [...(impliesMap.get(row.tag) ?? []), row.implies])
  }
  return (rows.results as (Omit<Tag, 'implies' | 'used'> & { used?: number | boolean })[]).map(({ used: rawUsed, ...row }) => ({
    ...row,
    implies: impliesMap.get(row.name) ?? [],
    ...(used ? { used: Boolean(rawUsed) } : {}),
  }))
}

// The latest changes of the tags, newest first, with who made each: a range of the key from the end.
export const CHANGES_SHOWN = 20
export type TagChangeKind = 'create' | 'move' | 'rename' | 'retype' | 'imply' | 'unimply' | 'delete'
export type TagChange = { id: number; name: string; kind: TagChangeKind; before: string | null; after: string | null; at: string; by_id: string | null; by_name: string | null }
export const changesStatement = (db: D1Database) =>
  db.prepare(`SELECT c.id, c.name, c.kind, c.before, c.after, c.at, p.id AS by_id, p.name AS by_name FROM tag_changes c LEFT JOIN people p ON p.id = c.actor ORDER BY c.id DESC LIMIT ${CHANGES_SHOWN}`)
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
const logEntry = (db: D1Database, guard: string, name: string, kind: TagChangeKind, before: unknown, after: unknown, who: Who) =>
  db.prepare(`INSERT INTO tag_changes(id, name, kind, before, after, actor, at) SELECT ${STAMP}, ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${guard}`)
    .bind(name, kind, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), who.actor, now())

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

export type NewTag = { name: string; type?: string | null; implies?: readonly string[] }
export type TagCreateResult = { ok: true; value: string; created: boolean } | { ok: false; code: 'invalid' | 'target' | 'depth' | 'limit' | 'conflict' }

function inserted(db: D1Database, input: { name: string; label: string; type: TagType; implies: readonly string[] }, who: Who, after: Record<string, unknown> = {}) {
  const targets = JSON.stringify(input.implies)
  return landed(db, [
    db.prepare(`INSERT OR IGNORE INTO tags(name, label, type, position, rev, created_by, created_at)
      SELECT ?1, ?2, ?3, ${NEXT_POSITION.replace('?', '?3')}, ${STAMP}, ?4, ?5
      WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name IN (?1, ?2) OR label IN (?1, ?2))
        AND (SELECT count(*) FROM json_each(?6) j WHERE EXISTS (SELECT 1 FROM tags WHERE name = j.value) AND j.value <> ?1) = json_array_length(?6)`)
      .bind(input.name, input.label, input.type, who.actor, now(), targets),
    ...(input.implies.length ? [
      db.prepare(`INSERT OR IGNORE INTO tag_implications(tag, implies)
        SELECT ?1, value FROM json_each(?2) WHERE ${stamped('?1')}`).bind(input.name, targets),
    ] : []),
    logEntry(db, stamped('?1'), input.name, 'create', null, { label: input.label, type: input.type, ...(input.implies.length ? { implies: input.implies } : {}), ...after }, who),
  ])
}

/**
 * Adds a tag with a type and optional implied tags. An existing tag's name or label resolves to that
 * tag and adds nothing.
 */
export async function createTag(db: D1Database, tags: readonly Tag[], input: NewTag, who: Who): Promise<TagCreateResult> {
  const value = cleanTag(input.name, tags)
  if (!value) return { ok: false, code: 'invalid' }
  if (tags.some(tag => tag.name === value)) return { ok: true, value, created: false }
  const type = input.type ? (isTagType(input.type) ? input.type : null) : 'general'
  if (!type) return { ok: false, code: 'invalid' }
  const implies = [...new Set((input.implies ?? []).map(item => item.normalize('NFC').trim()).filter(Boolean))]
  if (implies.length > TAG_IMPLIES_MAX) return { ok: false, code: 'limit' }
  if (implies.some(target => target === value || !tags.some(tag => tag.name === target))) return { ok: false, code: 'target' }
  const synthetic: Tag[] = [...tags, { name: value, label: value, type, position: Number.MAX_SAFE_INTEGER, rev: 0, n: 0, implies: [] }]
  // Validate depth/closure bounds for every initial implication edge.
  for (const target of implies) {
    const refusal = canImply(synthetic, value, target)
    if (refusal === 'depth') return { ok: false, code: 'depth' }
    if (refusal === 'limit') return { ok: false, code: 'limit' }
    if (refusal) return { ok: false, code: 'target' }
    synthetic[synthetic.length - 1].implies.push(target)
  }
  return await inserted(db, { name: value, label: value, type, implies }, who) ? { ok: true, value, created: true } : { ok: false, code: 'conflict' }
}

/** Gives every tag a record names that has no row yet a place under `general`, so each is typed and indexed. */
export async function ensureTags(db: D1Database, values: readonly string[], who: Who) {
  const named = [...new Set(values)]
  if (!named.length) return
  const missing = `SELECT value, key FROM json_each(?1) WHERE NOT EXISTS (SELECT 1 FROM tags WHERE name = value OR label = value)`
  await db.batch([
    db.prepare(`INSERT INTO tag_changes(name, kind, before, after, actor, at) SELECT value, 'create', NULL, json_object('label', value, 'type', 'general'), ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
    db.prepare(`INSERT OR IGNORE INTO tags(name, label, type, position, created_by, created_at) SELECT value, value, 'general', ${NEXT_POSITION.replace('?', "'general'")} + key, ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
  ])
}

export type ChangeCode = 'missing' | 'invalid' | 'target' | 'cycle' | 'depth' | 'limit' | 'exists' | 'used' | 'conflict' | 'too_large' | 'slow'
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
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET label = ?2, rev = ${STAMP} WHERE name = ?1 AND rev = ?3 AND NOT EXISTS (SELECT 1 FROM tags WHERE name != ?1 AND (name = ?2 OR label = ?2))`).bind(found.name, label, found.rev),
    logEntry(db, stamped('?1'), found.name, 'rename', { label: found.label }, { label, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** A tag's type changed (which changes its color everywhere). */
export async function retypeTag(db: D1Database, tags: readonly Tag[], input: { name: string; type: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(tags, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  if (!isTagType(input.type)) return refused('invalid')
  if (input.type === found.type) return { ok: true }
  const wrote = await landed(db, [
    db.prepare(`UPDATE tags SET type = ?2, rev = ${STAMP} WHERE name = ?1 AND rev = ?3`).bind(found.name, input.type, found.rev),
    logEntry(db, stamped('?1'), found.name, 'retype', { type: found.type }, { type: input.type, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The records filed under a tag or any tag that implies it, live ones only: a hidden or merged record
// holds no rows to list it by.
const MOVED = `WITH RECURSIVE ${DOWN('?1')}, moved(entry_id) AS (
  SELECT cl.entry_id FROM claims cl JOIN entries e ON e.id = cl.entry_id
  WHERE cl.kind = 'tag' AND cl.value IN (SELECT name FROM down) AND e.merged_into IS NULL AND e.hidden_at IS NULL
)`
/**
 * A record's tag rows, as `up(entry_id, name)`: each tag its claims name and every tag transitively
 * implied by them, read from `tags` and `tag_implications` as the batch that writes them runs.
 */
export const filedUnder = (records: string) => `up(entry_id, name) AS (
  SELECT cl.entry_id, cl.value FROM claims cl WHERE +cl.kind = 'tag' AND cl.entry_id ${records}
  UNION SELECT up.entry_id, i.implies FROM up JOIN tag_implications i ON i.tag = up.name
)`
/** Writes a record's tag rows from `up`, each with the record's sightings and year. */
export const FILE_ROWS = "INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year) SELECT 't:' || up.name, up.entry_id, e.sightings, CAST(e.first_year AS INTEGER) FROM up CROSS JOIN entries e ON e.id = up.entry_id"
const FILED = `, ${filedUnder('IN (SELECT entry_id FROM moved)')}`
const MOVED_ROWS = "SELECT tag, entry_id FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 't:' AND tag < 't;'"

/**
 * The statements that file every record under a tag (and anything implying it) again after an
 * implication changes. Each runs only while the tag's stamp stands.
 */
export function refileStatements(db: D1Database, name: string) {
  const guard = stamped('?1')
  return [
    db.prepare(`${MOVED}, rows AS (${MOVED_ROWS}) UPDATE tag_counts SET n = n - (SELECT count(*) FROM rows WHERE rows.tag = tag_counts.tag) WHERE tag IN (SELECT tag FROM rows) AND ${guard}`).bind(name),
    db.prepare(`${MOVED} DELETE FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 't:' AND tag < 't;' AND ${guard}`).bind(name),
    db.prepare(`${MOVED}${FILED} ${FILE_ROWS} WHERE ${guard}`).bind(name),
    db.prepare(`${MOVED} INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM (${MOVED_ROWS}) WHERE ${guard} GROUP BY tag ON CONFLICT(tag) DO UPDATE SET n = n + excluded.n`).bind(name),
  ]
}

export const MOVE_RECORDS_MAX = 1000
export const MOVES_PER_HOUR = 20
export const moveSizeStatement = (db: D1Database, name: string) => db.prepare("SELECT COALESCE((SELECT n FROM tag_counts WHERE tag = 't:' || ?), 0) AS n").bind(name)
const RECENT_MOVES = (actor: string, since: string) => `(SELECT count(*) FROM (SELECT 1 FROM tag_changes WHERE actor = ${actor} AND kind IN ('imply','unimply') AND at > ${since} AND json_extract(after, '$.undo') IS NULL LIMIT ${MOVES_PER_HOUR}))`
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
  const unused = "NOT EXISTS (SELECT 1 FROM tag_implications WHERE implies = ?1) AND NOT EXISTS (SELECT 1 FROM claims WHERE kind = 'tag' AND value = ?1)"
  const free = await db.prepare(`SELECT ${unused} AS free`).bind(found.name).first<{ free: number }>()
  if (!free?.free) return refused('used')
  const guard = `EXISTS (SELECT 1 FROM tags WHERE name = ?1 AND rev = ?7) AND ${unused}`
  const before = { label: found.label, type: found.type, ...(found.implies.length ? { implies: found.implies } : {}) }
  const wrote = await landed(db, [
    db.prepare(`INSERT INTO tag_changes(id, name, kind, before, after, actor, at) SELECT ${STAMP}, ?1, 'delete', ?2, ?3, ?4, ?5 WHERE ${guard.replace('?7', '?6')}`)
      .bind(found.name, JSON.stringify(before), input.undo ? JSON.stringify({ undo: input.undo }) : null, who.actor, now(), found.rev),
    db.prepare(`DELETE FROM tag_implications WHERE tag = ?1 AND EXISTS (SELECT 1 FROM tags WHERE name = ?1 AND rev = ?2) AND ${unused}`).bind(found.name, found.rev),
    db.prepare(`DELETE FROM tags WHERE name = ?1 AND rev = ?2 AND ${unused}`).bind(found.name, found.rev),
    db.prepare("DELETE FROM tag_counts WHERE tag = 't:' || ?1 AND n <= 0 AND NOT EXISTS (SELECT 1 FROM tags WHERE name = ?1)").bind(found.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The latest change of a tag, read from the end of its range of the log.
export const latestChangeStatement = (db: D1Database, name: string) => db.prepare('SELECT MAX(id) AS id FROM tag_changes WHERE name = ?').bind(name)

/**
 * Undoes a tag's latest change by applying its inverse through the same guarded writes.
 */
export async function undoTagChange(db: D1Database, tags: readonly Tag[], id: number, who: Who): Promise<ChangeResult> {
  const change = await db.prepare('SELECT id, name, kind, before, after FROM tag_changes WHERE id = ?').bind(id).first<{ id: number; name: string; kind: TagChangeKind; before: string | null; after: string | null }>()
  if (!change) return refused('missing')
  const latest = await latestChangeStatement(db, change.name).first<{ id: number }>()
  if (latest?.id !== change.id) return refused('conflict')
  let before: { label?: string; type?: string; implies?: string[] | string } = {}
  let after: { implies?: string } = {}
  try {
    before = change.before ? JSON.parse(change.before) : {}
    after = change.after ? JSON.parse(change.after) : {}
  } catch { return refused('invalid') }
  const rev = tags.find(tag => tag.name === change.name)?.rev
  switch (change.kind) {
    case 'rename': return renameTag(db, tags, { name: change.name, label: before.label ?? change.name, rev, undo: id }, who)
    case 'retype': return retypeTag(db, tags, { name: change.name, type: before.type ?? 'general', rev, undo: id }, who)
    case 'imply': return after.implies ? unimplyTag(db, tags, { name: change.name, target: after.implies, rev, undo: id }, who) : refused('invalid')
    case 'unimply': return typeof before.implies === 'string' ? implyTag(db, tags, { name: change.name, target: before.implies, rev, undo: id }, who) : refused('invalid')
    case 'create': return deleteTag(db, tags, { name: change.name, rev, undo: id }, who)
    case 'delete': {
      const label = before.label ?? change.name
      const type = isTagType(before.type) ? before.type : 'general'
      const implies = Array.isArray(before.implies) ? before.implies.filter(target => tags.some(tag => tag.name === target)) : []
      if (tags.some(tag => [tag.name, tag.label].some(taken => taken === change.name || taken === label))) return refused('exists')
      return await inserted(db, { name: change.name, label, type, implies }, who, { undo: id }) ? { ok: true } : refused('conflict')
    }
    default: return refused('invalid')
  }
}
