import { GENRE_DEPTH_MAX, categoryTree, cleanGenre, flatten, moveRefusal, placement, validGenreName, type Category } from '$lib/genres'

type Who = { actor: string; ip: string | null }
const now = () => new Date().toISOString()

// Every category with the records filed under it: the table in key order, the counts looked up by key, and
// capped. A page reads it once and passes it down. `used` asks, by the claims index, whether any record names
// each one, hidden and merged records too.
export const CATEGORIES_MAX = 1000
export const categoriesStatement = (db: D1Database, used = false) => db.prepare(`SELECT c.name, c.label, c.parent, c.position, c.rev, COALESCE(t.n, 0) AS n${used ? ", EXISTS (SELECT 1 FROM claims WHERE kind = 'genre' AND value = c.name) AS used" : ''} FROM categories c LEFT JOIN tag_counts t ON t.tag = 'g:' || c.name ORDER BY c.name LIMIT ${CATEGORIES_MAX}`)
export async function categoryList(db: D1Database, used = false): Promise<Category[]> {
  const { results } = await categoriesStatement(db, used).all<Category & { used?: number | boolean }>()
  return used ? results.map(row => ({ ...row, used: Boolean(row.used) })) : results
}

// The changes of the categories, newest first, with who made each: a range of the key from the end.
export const CHANGES_SHOWN = 20
export type CategoryChange = { id: number; name: string; kind: 'create' | 'move' | 'rename' | 'delete'; before: string | null; after: string | null; at: string; by_id: string | null; by_name: string | null }
export const changesStatement = (db: D1Database) => db.prepare(`SELECT c.id, c.name, c.kind, c.before, c.after, c.at, p.id AS by_id, p.name AS by_name FROM category_changes c LEFT JOIN people p ON p.id = c.actor ORDER BY c.id DESC LIMIT ${CHANGES_SHOWN}`)
export async function categoryChanges(db: D1Database) {
  const { results } = await changesStatement(db).all<CategoryChange>()
  return results
}

// A write that lands only where it read: it stamps what it changes with the id its log row is about to take
// (`STAMP`), every statement after it in the batch runs only while that stamp stands, and the log row comes
// last. Nothing else writes in between, so a write refused by its guard changes nothing at all.
// The ids come from the table's sequence, which never goes back, so a stamp is never an id used before.
const LAST_CHANGE = "(SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'category_changes'), 0))"
const STAMP = `(${LAST_CHANGE} + 1)`
const stamped = (slot: string) => `(SELECT rev FROM categories WHERE name = ${slot}) = ${STAMP}`
const logEntry = (db: D1Database, guard: string, name: string, kind: CategoryChange['kind'], before: unknown, after: unknown, who: Who) =>
  db.prepare(`INSERT INTO category_changes(id, name, kind, before, after, actor, at) SELECT ${STAMP}, ?1, ?2, ?3, ?4, ?5, ?6 WHERE ${guard}`)
    .bind(name, kind, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), who.actor, now())
/** Runs a guarded batch, and answers whether it wrote: whether a log row was added. */
async function landed(db: D1Database, statements: D1PreparedStatement[]) {
  const results = await db.batch([db.prepare(`SELECT ${LAST_CHANGE} AS last`), ...statements, db.prepare(`SELECT ${LAST_CHANGE} AS last`)])
  const last = (result: D1Result | undefined) => (result?.results as { last: number }[] | undefined)?.[0]?.last ?? 0
  return last(results.at(-1)) > last(results[0])
}

// The level of an existing category, the top being 1, as a chain of existing rows above it: `up` from `slot`.
const UP = (slot: string) => `up(name, depth) AS (
  SELECT name, 1 FROM categories WHERE name = ${slot}
  UNION SELECT p.name, up.depth + 1 FROM up JOIN categories c ON c.name = up.name JOIN categories p ON p.name = c.parent WHERE up.depth < ${GENRE_DEPTH_MAX * 2}
)`

// The place after the last category under a parent, read from the end of the parent's range.
const NEXT_POSITION = '(SELECT COALESCE(MAX(position) + 1, 0) FROM categories WHERE parent IS ?)'

export type NewCategory = { name: string; parent: string | null }
export type CategoryResult = { ok: true; value: string; created: boolean } | { ok: false; code: 'invalid' | 'parent' | 'depth' | 'conflict' }

/** Inserts a category last under its parent; the parent's existence and depth are checked as it is written. */
function inserted(db: D1Database, input: { name: string; label: string; parent: string | null }, who: Who, after: Record<string, unknown> = {}) {
  return landed(db, [
    db.prepare(`WITH RECURSIVE ${UP('?3')} INSERT OR IGNORE INTO categories(name, label, parent, position, rev, created_by, created_at)
      SELECT ?1, ?2, ?3, ${NEXT_POSITION.replace('?', '?3')}, ${STAMP}, ?4, ?5
      WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name IN (?1, ?2) OR label IN (?1, ?2)) AND (?3 IS NULL OR EXISTS (SELECT 1 FROM up)) AND (SELECT count(*) FROM up) < ${GENRE_DEPTH_MAX}`)
      .bind(input.name, input.label, input.parent, who.actor, now()),
    logEntry(db, stamped('?1'), input.name, 'create', null, { label: input.label, parent: input.parent, ...after }, who),
  ])
}

/**
 * Adds a category under another or at the top, named and labelled as typed. A category's name or label is
 * that category and adds nothing. A chain has at most `GENRE_DEPTH_MAX` levels.
 */
export async function createCategory(db: D1Database, categories: readonly Category[], input: NewCategory, who: Who): Promise<CategoryResult> {
  const value = cleanGenre(input.name, categories)
  if (!value) return { ok: false, code: 'invalid' }
  if (categories.some(category => category.name === value)) return { ok: true, value, created: false }
  const parent = input.parent ? input.parent.normalize('NFC') : null
  const above = parent === null ? null : flatten(categoryTree(categories)).find(category => category.name === parent)
  if (above === undefined) return { ok: false, code: 'parent' }
  if ((above?.level ?? 0) + 1 > GENRE_DEPTH_MAX) return { ok: false, code: 'depth' }
  return await inserted(db, { name: value, label: value, parent }, who) ? { ok: true, value, created: true } : { ok: false, code: 'conflict' }
}

/** Gives every category a record names that has no row yet a place at the end of the top, so each is filed. */
export async function ensureCategories(db: D1Database, values: readonly string[], who: Who) {
  const named = [...new Set(values)]
  if (!named.length) return
  const missing = `SELECT value, key FROM json_each(?1) WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = value OR label = value)`
  await db.batch([
    db.prepare(`INSERT INTO category_changes(name, kind, before, after, actor, at) SELECT value, 'create', NULL, json_object('label', value, 'parent', NULL), ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
    db.prepare(`INSERT OR IGNORE INTO categories(name, label, parent, position, created_by, created_at) SELECT value, value, NULL, ${NEXT_POSITION.replace('?', 'NULL')} + key, ?2, ?3 FROM (${missing})`).bind(JSON.stringify(named), who.actor, now()),
  ])
}

export type ChangeCode = 'missing' | 'invalid' | 'parent' | 'depth' | 'exists' | 'used' | 'conflict' | 'too_large' | 'slow'
export type ChangeResult = { ok: true } | { ok: false; code: ChangeCode }
const refused = (code: ChangeCode): ChangeResult => ({ ok: false, code })
/** The row a change is about, as the writer read it: missing, or changed since it was read. */
function current(categories: readonly Category[], name: string, rev: number | undefined) {
  const found = categories.find(category => category.name === name)
  return !found ? 'missing' as const : rev !== undefined && rev !== found.rev ? 'conflict' as const : found
}
type Undo = { undo?: number }

/** A category's label changed; its name, its claims and its rows stay. */
export async function renameCategory(db: D1Database, categories: readonly Category[], input: { name: string; label: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(categories, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const label = input.label.normalize('NFC').trim()
  if (!validGenreName(label)) return refused('invalid')
  if (label === found.label) return { ok: true }
  // A label names one category, and no other category's name.
  if (categories.some(category => category.name !== found.name && (category.label === label || category.name === label))) return refused('exists')
  const wrote = await landed(db, [
    db.prepare(`UPDATE categories SET label = ?2, rev = ${STAMP} WHERE name = ?1 AND rev = ?3 AND NOT EXISTS (SELECT 1 FROM categories WHERE name != ?1 AND (name = ?2 OR label = ?2))`).bind(found.name, label, found.rev),
    logEntry(db, stamped('?1'), found.name, 'rename', { label: found.label }, { label, ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

/** A category no record names and with no category under it goes. */
export async function deleteCategory(db: D1Database, categories: readonly Category[], input: { name: string; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(categories, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const unused = "NOT EXISTS (SELECT 1 FROM categories WHERE parent = ?1) AND NOT EXISTS (SELECT 1 FROM claims WHERE kind = 'genre' AND value = ?1)"
  const free = await db.prepare(`SELECT ${unused} AS free`).bind(found.name).first<{ free: number }>()
  if (!free?.free) return refused('used')
  // The log row and the delete read the same guard, so both happen or neither does.
  const guard = `EXISTS (SELECT 1 FROM categories WHERE name = ?1 AND rev = ?7) AND ${unused}`
  const wrote = await landed(db, [
    db.prepare(`INSERT INTO category_changes(id, name, kind, before, after, actor, at) SELECT ${STAMP}, ?1, 'delete', ?2, ?3, ?4, ?5 WHERE ${guard.replace('?7', '?6')}`)
      .bind(found.name, JSON.stringify({ label: found.label, parent: found.parent }), input.undo ? JSON.stringify({ undo: input.undo }) : null, who.actor, now(), found.rev),
    db.prepare(`DELETE FROM categories WHERE name = ?1 AND rev = ?2 AND ${unused}`).bind(found.name, found.rev),
    db.prepare("DELETE FROM tag_counts WHERE tag = 'g:' || ?1 AND n <= 0 AND NOT EXISTS (SELECT 1 FROM categories WHERE name = ?1)").bind(found.name),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The records filed under a category or any category below it, live ones only: a hidden or merged record
// holds no rows to list it by.
const MOVED = `WITH RECURSIVE down(name, depth) AS (
  SELECT ?1, 1
  UNION SELECT c.name, down.depth + 1 FROM categories c JOIN down ON c.parent = down.name WHERE down.depth < ${GENRE_DEPTH_MAX}
), moved(entry_id) AS (
  SELECT cl.entry_id FROM claims cl JOIN entries e ON e.id = cl.entry_id
  WHERE cl.kind = 'genre' AND cl.value IN (SELECT name FROM down) AND e.merged_into IS NULL AND e.hidden_at IS NULL
)`
/**
 * A record's category rows, as `up(entry_id, name)`: each category its claims name and every category above
 * it, read from `categories` as the batch that writes them runs. `records` completes `cl.entry_id …`, as
 * `= ?` for one record or `IN (…)` for several; the claims are read by record, through `claims_by_entry`.
 */
export const filedUnder = (records: string) => `up(entry_id, name, depth) AS (
  SELECT cl.entry_id, cl.value, 1 FROM claims cl WHERE +cl.kind = 'genre' AND cl.entry_id ${records}
  UNION SELECT up.entry_id, c.parent, up.depth + 1 FROM up JOIN categories c ON c.name = up.name WHERE c.parent IS NOT NULL AND up.depth <= ${GENRE_DEPTH_MAX}
)`
/** Writes a record's category rows from `up`, each with the record's sightings and year, as `reindex` writes its other rows. */
// The record is joined after `up`, by its key, whatever the planner's statistics say.
export const FILE_ROWS = "INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year) SELECT 'g:' || up.name, up.entry_id, e.sightings, CAST(e.first_year AS INTEGER) FROM up CROSS JOIN entries e ON e.id = up.entry_id"
const FILED = `, ${filedUnder('IN (SELECT entry_id FROM moved)')}`
const MOVED_ROWS = "SELECT tag, entry_id FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 'g:' AND tag < 'g;'"

/**
 * The statements that file every record under a category again, after the category has moved. Each runs
 * only while the move's stamp stands, so they follow a move and nothing else.
 */
export function refileStatements(db: D1Database, name: string) {
  const guard = stamped('?1')
  return [
    db.prepare(`${MOVED}, rows AS (${MOVED_ROWS}) UPDATE tag_counts SET n = n - (SELECT count(*) FROM rows WHERE rows.tag = tag_counts.tag) WHERE tag IN (SELECT tag FROM rows) AND ${guard}`).bind(name),
    db.prepare(`${MOVED} DELETE FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 'g:' AND tag < 'g;' AND ${guard}`).bind(name),
    db.prepare(`${MOVED}${FILED} ${FILE_ROWS} WHERE ${guard}`).bind(name),
    db.prepare(`${MOVED} INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM (${MOVED_ROWS}) WHERE ${guard} GROUP BY tag ON CONFLICT(tag) DO UPDATE SET n = n + excluded.n`).bind(name),
  ]
}

/**
 * Renumbers the categories under one parent in the order given, while the move's stamp stands. A category
 * that has gone to another parent since the order was read keeps its place there.
 */
const renumbered = (db: D1Database, name: string, parent: string | null, names: readonly string[]) =>
  db.prepare(`UPDATE categories SET position = (SELECT key FROM json_each(?2) WHERE value = categories.name) WHERE name IN (SELECT value FROM json_each(?2)) AND parent IS ?3 AND ${stamped('?1')}`).bind(name, JSON.stringify(names), parent)

// A move files again every record under the category it moves, so it is refused past this many, and a
// writer makes at most `MOVES_PER_HOUR` of them an hour, undoing not counted. The address limits of
// `guard.ts` count a window of a minute at most, so this one is counted from the log, by its writer index,
// once to answer why and again inside the guarded write, so two moves at once cannot both pass it. The
// undone moves of the hour are read and passed over; the address limit keeps them to a few hundred.
export const MOVE_RECORDS_MAX = 1000
export const MOVES_PER_HOUR = 10
export const moveSizeStatement = (db: D1Database, name: string) => db.prepare("SELECT COALESCE((SELECT n FROM tag_counts WHERE tag = 'g:' || ?), 0) AS n").bind(name)
const RECENT_MOVES = (actor: string, since: string) => `(SELECT count(*) FROM (SELECT 1 FROM category_changes WHERE actor = ${actor} AND kind = 'move' AND at > ${since} AND json_extract(after, '$.undo') IS NULL LIMIT ${MOVES_PER_HOUR}))`
export const recentMovesStatement = (db: D1Database, actor: string, since: string) => db.prepare(`SELECT ${RECENT_MOVES('?1', '?2')} AS n`).bind(actor, since)

/**
 * Puts a category under another, or at the top, at `position` among the categories there; the others there
 * are renumbered. A category never goes under itself or a category below it, nor past the depth cap, and
 * the records filed under it are filed under its new parents in the same batch. Every part of that is
 * checked again as it is written: a move made meanwhile refuses this one whole.
 */
export async function moveCategory(db: D1Database, categories: readonly Category[], input: { name: string; parent: string | null; position: number; rev?: number } & Undo, who: Who): Promise<ChangeResult> {
  const found = current(categories, input.name, input.rev)
  if (typeof found === 'string') return refused(found)
  const roots = categoryTree(categories), nodes = flatten(roots)
  const parent = input.parent || null
  const refusal = moveRefusal(nodes, input.name, parent)
  if (refusal) return refused(refusal)
  if (!Number.isInteger(input.position) || input.position < 0) return refused('invalid')
  const since = new Date(Date.now() - 3600_000).toISOString(), limited = !input.undo
  const [size, recent] = await Promise.all([moveSizeStatement(db, found.name).first<{ n: number }>(), recentMovesStatement(db, who.actor, since).first<{ n: number }>()])
  if ((size?.n ?? 0) > MOVE_RECORDS_MAX) return refused('too_large')
  if (limited && (recent?.n ?? 0) >= MOVES_PER_HOUR) return refused('slow')
  const { from, order, left } = placement(roots, found.name, parent, input.position)
  // Its place as the tree showed it, which an undo puts it back at exactly.
  const was = (from === null ? roots : nodes.find(node => node.name === from)!.children).findIndex(node => node.name === found.name)
  // The records are filed again when the stored parent changes, a parent the tree could not place included.
  const refile = found.parent !== parent
  const wrote = await landed(db, [
    db.prepare(`WITH RECURSIVE ${UP('?2')}, down(name, depth) AS (
        SELECT ?1, 1
        UNION SELECT c.name, down.depth + 1 FROM categories c JOIN down ON c.parent = down.name WHERE down.depth < ${GENRE_DEPTH_MAX * 2}
      )
      UPDATE categories SET parent = ?2, position = ?3, rev = ${STAMP}
      WHERE name = ?1 AND rev = ?4
        AND (?2 IS NULL OR EXISTS (SELECT 1 FROM up))
        AND NOT EXISTS (SELECT 1 FROM up WHERE name = ?1)
        AND (SELECT count(*) FROM up) + (SELECT max(depth) FROM down) <= ${GENRE_DEPTH_MAX}
        AND COALESCE((SELECT n FROM tag_counts WHERE tag = 'g:' || ?1), 0) <= ${MOVE_RECORDS_MAX}
        AND (NOT ?7 OR ${RECENT_MOVES('?5', '?6')} < ${MOVES_PER_HOUR})`).bind(found.name, parent, order.indexOf(found.name), found.rev, who.actor, since, limited ? 1 : 0),
    renumbered(db, found.name, parent, order),
    ...(from !== parent ? [renumbered(db, found.name, from, left)] : []),
    ...(refile ? refileStatements(db, found.name) : []),
    logEntry(db, stamped('?1'), found.name, 'move', { parent: found.parent, position: was }, { parent, position: order.indexOf(found.name), ...(input.undo ? { undo: input.undo } : {}) }, who),
  ])
  return wrote ? { ok: true } : refused('conflict')
}

// The latest change of a category, read from the end of its range of the log.
export const latestChangeStatement = (db: D1Database, name: string) => db.prepare('SELECT MAX(id) AS id FROM category_changes WHERE name = ?').bind(name)

/**
 * Takes back a category's latest change by the inverse change, through the same guarded writes: a move goes
 * back, a rename returns the old label, an added category still empty goes, and a deleted one comes back
 * last under its old parent, or at the top when that has gone. The undo is a change of its own.
 */
export async function undoChange(db: D1Database, categories: readonly Category[], id: number, who: Who): Promise<ChangeResult> {
  const change = await db.prepare('SELECT id, name, kind, before FROM category_changes WHERE id = ?').bind(id).first<{ id: number; name: string; kind: CategoryChange['kind']; before: string | null }>()
  if (!change) return refused('missing')
  const latest = await latestChangeStatement(db, change.name).first<{ id: number }>()
  if (latest?.id !== change.id) return refused('conflict')
  let before: { label?: string; parent?: string | null; position?: number } = {}
  try { before = change.before ? JSON.parse(change.before) : {} } catch { return refused('invalid') }
  const rev = categories.find(category => category.name === change.name)?.rev
  switch (change.kind) {
    case 'move': return moveCategory(db, categories, { name: change.name, parent: before.parent ?? null, position: before.position ?? 0, rev, undo: id }, who)
    case 'rename': return renameCategory(db, categories, { name: change.name, label: before.label ?? change.name, rev, undo: id }, who)
    case 'create': return deleteCategory(db, categories, { name: change.name, rev, undo: id }, who)
    case 'delete': {
      const label = before.label ?? change.name
      if (categories.some(category => [category.name, category.label].some(taken => taken === change.name || taken === label))) return refused('exists')
      const parent = before.parent && categories.some(category => category.name === before.parent) ? before.parent : null
      return await inserted(db, { name: change.name, label, parent }, who, { undo: id }) ? { ok: true } : refused('conflict')
    }
    default: return refused('invalid')
  }
}
