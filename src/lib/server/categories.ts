import { GENRE_DEPTH_MAX, cleanGenre, genreOf, type CustomGenre } from '$lib/genres'

type Who = { actor: string; ip: string | null }

// The categories people have added, with the records filed under each: one range of the table by key, the
// counts looked up by key, and capped.
export const CATEGORIES_MAX = 500
export const customGenresStatement = (db: D1Database) => db.prepare(`SELECT c.name AS value, c.parent, COALESCE(t.n, 0) AS n FROM categories c LEFT JOIN tag_counts t ON t.tag = 'g:' || c.name WHERE c.name > '' LIMIT ${CATEGORIES_MAX}`)
export async function customGenres(db: D1Database): Promise<CustomGenre[]> {
  const { results } = await customGenresStatement(db).all<CustomGenre>()
  return results.sort((a, b) => b.n - a.n || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
}

// What each given category sits under, with everything above it, read by key one level at a time and no
// deeper than a chain can go.
export const categoryParentsStatement = (db: D1Database, names: readonly string[]) => db.prepare(`WITH RECURSIVE up(name, parent, depth) AS (
  SELECT name, parent, 1 FROM categories WHERE name IN (SELECT value FROM json_each(?))
  UNION SELECT c.name, c.parent, up.depth + 1 FROM categories c JOIN up ON c.name = up.parent WHERE up.depth < ${GENRE_DEPTH_MAX}
) SELECT name, parent FROM up`).bind(JSON.stringify(names))
export async function categoryParents(db: D1Database, names: readonly string[]) {
  const custom = [...new Set(names.filter(name => !genreOf(name)))]
  if (!custom.length) return new Map<string, string | null>()
  const { results } = await categoryParentsStatement(db, custom).all<{ name: string; parent: string | null }>()
  return new Map(results.map(row => [row.name, row.parent]))
}

/** The categories a category is filed under, nearest first, as far up as the chain goes. */
export function ancestorsOf(value: string, parents: ReadonlyMap<string, string | null>) {
  const chain: string[] = []
  for (let next = genreOf(value) ? genreOf(value)!.parent : parents.get(value); next && chain.length < GENRE_DEPTH_MAX; next = genreOf(next) ? genreOf(next)!.parent : parents.get(next)) chain.push(next)
  return chain
}

const levels = (parent: string | null, parents: ReadonlyMap<string, string | null>) => (parent ? ancestorsOf(parent, parents).length + 1 : 0)

export type NewCategory = { name: string; parent: string | null }
export type CategoryResult = { ok: true; value: string; created: boolean } | { ok: false; code: 'invalid' | 'parent' | 'depth' }

/**
 * Adds a category under a built-in or custom one, or at the top. A name that is a built-in category's
 * label or slug is that category and adds nothing, and a name already added stays where it is. A chain has
 * at most `GENRE_DEPTH_MAX` levels.
 */
export async function createCategory(db: D1Database, input: NewCategory, who: Who): Promise<CategoryResult> {
  const value = cleanGenre(input.name)
  if (!value) return { ok: false, code: 'invalid' }
  if (genreOf(value)) return { ok: true, value, created: false }
  const parent = input.parent ? input.parent.normalize('NFC') : null
  const found = await db.prepare('SELECT 1 AS found FROM categories WHERE name = ?').bind(value).first()
  if (found) return { ok: true, value, created: false }
  if (parent) {
    const known = genreOf(parent) || await db.prepare('SELECT 1 AS found FROM categories WHERE name = ?').bind(parent).first()
    if (!known || parent === value) return { ok: false, code: 'parent' }
    // The parent's chain: a loop in it would run past the cap.
    const above = await categoryParents(db, [parent])
    if (levels(parent, above) + 1 > GENRE_DEPTH_MAX) return { ok: false, code: 'depth' }
  }
  const done = await db.prepare('INSERT OR IGNORE INTO categories(name, parent, created_by, created_at) VALUES(?, ?, ?, ?)').bind(value, parent, who.actor, new Date().toISOString()).run() as { meta?: { changes?: number }; changes?: number }
  return { ok: true, value, created: (done.meta?.changes ?? done.changes ?? 1) > 0 }
}

/** Gives every category a record names that has no row yet a place at the top, so each is filed. */
export async function ensureCategories(db: D1Database, values: readonly string[], who: Who) {
  const custom = [...new Set(values.filter(value => !genreOf(value)))]
  if (!custom.length) return
  await db.prepare('INSERT OR IGNORE INTO categories(name, parent, created_by, created_at) SELECT value, NULL, ?, ? FROM json_each(?)').bind(who.actor, new Date().toISOString(), JSON.stringify(custom)).run()
}
