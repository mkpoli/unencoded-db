import { GENRE_DEPTH_MAX, categoryTree, cleanGenre, flatten, moveRefusal, placement, validGenreName, type Category } from '$lib/genres'

type Who = { actor: string; ip: string | null }
const now = () => new Date().toISOString()

// Every category with the records filed under it: one range of the table by key, the counts looked up by
// key, and capped. A page reads it once and passes it down.
export const CATEGORIES_MAX = 1000
export const categoriesStatement = (db: D1Database) => db.prepare(`SELECT c.name, c.label, c.parent, c.position, COALESCE(t.n, 0) AS n FROM categories c LEFT JOIN tag_counts t ON t.tag = 'g:' || c.name WHERE c.name > '' LIMIT ${CATEGORIES_MAX}`)
export async function categoryList(db: D1Database): Promise<Category[]> {
  const { results } = await categoriesStatement(db).all<Category>()
  return results
}

// What each given category sits under, with everything above it, read by key one level at a time and no
// deeper than a chain can go.
export const categoryParentsStatement = (db: D1Database, names: readonly string[]) => db.prepare(`WITH RECURSIVE up(name, parent, depth) AS (
  SELECT name, parent, 1 FROM categories WHERE name IN (SELECT value FROM json_each(?))
  UNION SELECT c.name, c.parent, up.depth + 1 FROM categories c JOIN up ON c.name = up.parent WHERE up.depth < ${GENRE_DEPTH_MAX}
) SELECT name, parent FROM up`).bind(JSON.stringify(names))
export async function categoryParents(db: D1Database, names: readonly string[]) {
  const asked = [...new Set(names)]
  if (!asked.length) return new Map<string, string | null>()
  const { results } = await categoryParentsStatement(db, asked).all<{ name: string; parent: string | null }>()
  return new Map(results.map(row => [row.name, row.parent]))
}

/** The categories a category is filed under, nearest first, as far up as the chain goes. */
export function ancestorsOf(value: string, parents: ReadonlyMap<string, string | null>) {
  const chain: string[] = []
  for (let next = parents.get(value); next && chain.length < GENRE_DEPTH_MAX; next = parents.get(next)) chain.push(next)
  return chain
}

// The changes of the categories, newest first, with who made each: a range of the key from the end.
export const CHANGES_SHOWN = 20
export type CategoryChange = { id: number; name: string; kind: 'create' | 'move' | 'rename' | 'delete'; before: string | null; after: string | null; at: string; by_id: string | null; by_name: string | null }
export const changesStatement = (db: D1Database) => db.prepare(`SELECT c.id, c.name, c.kind, c.before, c.after, c.at, p.id AS by_id, p.name AS by_name FROM category_changes c LEFT JOIN people p ON p.id = c.actor ORDER BY c.id DESC LIMIT ${CHANGES_SHOWN}`)
export async function categoryChanges(db: D1Database) {
  const { results } = await changesStatement(db).all<CategoryChange>()
  return results
}

const logged = (db: D1Database, name: string, kind: CategoryChange['kind'], before: unknown, after: unknown, who: Who) =>
  db.prepare('INSERT INTO category_changes(name, kind, before, after, actor, at) VALUES(?, ?, ?, ?, ?, ?)').bind(name, kind, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), who.actor, now())

// The place after the last category under a parent, read from the end of the parent's range.
const NEXT_POSITION = '(SELECT COALESCE(MAX(position) + 1, 0) FROM categories WHERE parent IS ?)'

export type NewCategory = { name: string; parent: string | null }
export type CategoryResult = { ok: true; value: string; created: boolean } | { ok: false; code: 'invalid' | 'parent' | 'depth' }

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
  const at = now()
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO categories(name, label, parent, position, created_by, created_at) SELECT ?1, ?1, ?2, ${NEXT_POSITION.replace('?', '?2')}, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE label = ?1)`).bind(value, parent, who.actor, at),
    // Logged only when this write is the one that made it.
    db.prepare(`INSERT INTO category_changes(name, kind, before, after, actor, at) SELECT ?1, 'create', NULL, json_object('label', ?1, 'parent', ?2), ?3, ?4 WHERE EXISTS (SELECT 1 FROM categories WHERE name = ?1 AND created_by IS ?3 AND created_at IS ?4)`).bind(value, parent, who.actor, at),
  ])
  const made = await db.prepare('SELECT created_by, created_at FROM categories WHERE name = ?').bind(value).first<{ created_by: string | null; created_at: string | null }>()
  if (!made) return { ok: false, code: 'invalid' }
  return { ok: true, value, created: made.created_by === who.actor && made.created_at === at }
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

export type ChangeResult = { ok: true } | { ok: false; code: 'missing' | 'invalid' | 'parent' | 'depth' | 'exists' | 'used' }

/** A category's label changed; its name, its claims and its rows stay. */
export async function renameCategory(db: D1Database, categories: readonly Category[], input: { name: string; label: string }, who: Who): Promise<ChangeResult> {
  const found = categories.find(category => category.name === input.name)
  if (!found) return { ok: false, code: 'missing' }
  const label = input.label.normalize('NFC').trim()
  if (!validGenreName(label)) return { ok: false, code: 'invalid' }
  if (label === found.label) return { ok: true }
  // A label names one category, and no other category's name.
  if (categories.some(category => category.name !== found.name && (category.label === label || category.name === label))) return { ok: false, code: 'exists' }
  await db.batch([
    db.prepare('UPDATE categories SET label = ? WHERE name = ?').bind(label, found.name),
    logged(db, found.name, 'rename', { label: found.label }, { label }, who),
  ])
  return { ok: true }
}

/** A category no record names and with no category under it goes. */
export async function deleteCategory(db: D1Database, categories: readonly Category[], name: string, who: Who): Promise<ChangeResult> {
  const found = categories.find(category => category.name === name)
  if (!found) return { ok: false, code: 'missing' }
  const unused = 'NOT EXISTS (SELECT 1 FROM categories WHERE parent = ?1) AND NOT EXISTS (SELECT 1 FROM claims WHERE kind = \'genre\' AND value = ?1)'
  const free = await db.prepare(`SELECT ${unused} AS free`).bind(name).first<{ free: number }>()
  if (!free?.free) return { ok: false, code: 'used' }
  await db.batch([
    db.prepare(`DELETE FROM categories WHERE name = ?1 AND ${unused}`).bind(name),
    db.prepare("DELETE FROM tag_counts WHERE tag = 'g:' || ?1 AND n <= 0 AND NOT EXISTS (SELECT 1 FROM categories WHERE name = ?1)").bind(name),
    db.prepare(`INSERT INTO category_changes(name, kind, before, after, actor, at) SELECT ?1, 'delete', ?2, NULL, ?3, ?4 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?1)`)
      .bind(name, JSON.stringify({ label: found.label, parent: found.parent }), who.actor, now()),
  ])
  return { ok: true }
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
// A record's category rows are each category it names with every category above it, as `facetTags` files
// them, and each carries the record's sightings and year, as `reindex` writes them.
const FILED = `, up(entry_id, name, depth) AS (
  SELECT cl.entry_id, cl.value, 1 FROM claims cl WHERE cl.kind = 'genre' AND cl.entry_id IN (SELECT entry_id FROM moved)
  UNION SELECT up.entry_id, c.parent, up.depth + 1 FROM up JOIN categories c ON c.name = up.name WHERE c.parent IS NOT NULL AND up.depth <= ${GENRE_DEPTH_MAX}
)`
const MOVED_ROWS = "SELECT tag, entry_id FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 'g:' AND tag < 'g;'"

/** The statements that file every record under a category again, after the category has moved. */
export function refileStatements(db: D1Database, name: string) {
  return [
    db.prepare(`${MOVED}, rows AS (${MOVED_ROWS}) UPDATE tag_counts SET n = n - (SELECT count(*) FROM rows WHERE rows.tag = tag_counts.tag) WHERE tag IN (SELECT tag FROM rows)`).bind(name),
    db.prepare(`${MOVED} DELETE FROM entry_tags WHERE entry_id IN (SELECT entry_id FROM moved) AND tag >= 'g:' AND tag < 'g;'`).bind(name),
    db.prepare(`${MOVED}${FILED} INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year) SELECT 'g:' || up.name, up.entry_id, e.sightings, CAST(e.first_year AS INTEGER) FROM up JOIN entries e ON e.id = up.entry_id WHERE true`).bind(name),
    db.prepare(`${MOVED} INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM (${MOVED_ROWS}) WHERE true GROUP BY tag ON CONFLICT(tag) DO UPDATE SET n = n + excluded.n`).bind(name),
  ]
}

/** Renumbers the categories under one parent in the order given. */
const renumbered = (db: D1Database, names: readonly string[]) =>
  db.prepare('UPDATE categories SET position = (SELECT key FROM json_each(?1) WHERE value = categories.name) WHERE name IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(names))

/**
 * Puts a category under another, or at the top, at `position` among the categories there; the others there
 * are renumbered. A category never goes under itself or a category below it, nor past the depth cap, and
 * the records filed under it are filed under its new parents in the same batch.
 */
export async function moveCategory(db: D1Database, categories: readonly Category[], input: { name: string; parent: string | null; position: number }, who: Who): Promise<ChangeResult> {
  const roots = categoryTree(categories), nodes = flatten(roots)
  const parent = input.parent || null
  const refused = moveRefusal(nodes, input.name, parent)
  if (refused) return { ok: false, code: refused }
  if (!Number.isInteger(input.position) || input.position < 0) return { ok: false, code: 'invalid' }
  const node = nodes.find(category => category.name === input.name)!
  const { from, order, left } = placement(roots, node.name, parent, input.position)
  const moved = from !== parent
  await db.batch([
    // The parent is checked again as it is written, so a move made meanwhile cannot close a loop.
    db.prepare(`WITH RECURSIVE up(name, depth) AS (SELECT ?2, 1 UNION SELECT c.parent, up.depth + 1 FROM categories c JOIN up ON c.name = up.name WHERE c.parent IS NOT NULL AND up.depth < ${GENRE_DEPTH_MAX})
      UPDATE categories SET parent = ?2 WHERE name = ?1 AND ?1 NOT IN (SELECT name FROM up WHERE name IS NOT NULL)`).bind(node.name, parent),
    renumbered(db, order),
    ...(moved ? [renumbered(db, left), ...refileStatements(db, node.name)] : []),
    logged(db, node.name, 'move', { parent: from, position: node.position }, { parent, position: order.indexOf(node.name) }, who),
  ])
  return { ok: true }
}
