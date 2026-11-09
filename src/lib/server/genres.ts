export type Genre = { slug: string; label: string; parent: string | null }

export async function listGenres(db: D1Database): Promise<Genre[]> {
  const { results } = await db.prepare('SELECT slug, label, parent FROM genres ORDER BY rowid').bind().all<Genre>()
  return results
}

export async function genresForEntry(db: D1Database, entryId: number): Promise<Genre[]> {
  const { results } = await db.prepare('SELECT g.slug, g.label, g.parent FROM genres g JOIN entry_genres eg ON eg.genre = g.slug WHERE eg.entry_id = ? ORDER BY g.rowid').bind(entryId).all<Genre>()
  return results
}

/** The genre and every genre grouped under it, so browsing a parent includes its children. */
export async function genreFamily(db: D1Database, slug: string): Promise<string[]> {
  const { results } = await db.prepare('SELECT slug FROM genres WHERE slug = ? OR parent = ? ORDER BY rowid').bind(slug, slug).all<{ slug: string }>()
  return results.map(row => row.slug)
}

export function selectedGenres(form: FormData): string[] {
  return [...new Set(form.getAll('genre').filter((value): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,40}$/.test(value)))]
}

export async function saveGenres(db: D1Database, entryId: number, slugs: string[]) {
  await db.prepare('DELETE FROM entry_genres WHERE entry_id = ?').bind(entryId).run()
  if (!slugs.length) return
  await db.prepare(`INSERT OR IGNORE INTO entry_genres (entry_id, genre) SELECT ?, slug FROM genres WHERE slug IN (${slugs.map(() => '?').join(', ')})`).bind(entryId, ...slugs).run()
}
