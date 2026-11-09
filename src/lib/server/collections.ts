export type Collection = { slug: string; label: string }

export async function listCollections(db: D1Database): Promise<Collection[]> {
  const { results } = await db.prepare('SELECT slug, label FROM collections ORDER BY rowid').bind().all<Collection>()
  return results
}

export async function collectionsForEntry(db: D1Database, entryId: number): Promise<Collection[]> {
  const { results } = await db.prepare('SELECT c.slug, c.label FROM collections c JOIN entry_collections ec ON ec.collection = c.slug WHERE ec.entry_id = ? ORDER BY c.rowid').bind(entryId).all<Collection>()
  return results
}

export function selectedCollections(form: FormData): string[] {
  return [...new Set(form.getAll('collection').filter((value): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(value)))]
}

export async function saveCollections(db: D1Database, entryId: number, slugs: string[], evidenceId: number | null) {
  await db.prepare('DELETE FROM entry_collections WHERE entry_id = ?').bind(entryId).run()
  if (!slugs.length) return
  await db.prepare(`INSERT OR IGNORE INTO entry_collections (entry_id, collection, evidence_id) SELECT ?, slug, ? FROM collections WHERE slug IN (${slugs.map(() => '?').join(', ')})`).bind(entryId, evidenceId, ...slugs).run()
}
