export function parseTags(value: string): string[] {
  return [...new Set(value.split(',').map(tag => tag.normalize('NFC').trim()).filter(tag => tag.length > 0 && tag.length <= 40))].slice(0, 20)
}

export async function listTags(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT tag FROM character_tags GROUP BY tag ORDER BY count(*) DESC, tag LIMIT 200").bind().all<{ tag: string }>()
  return results.map(row => row.tag)
}

export async function tagsForEntry(db: D1Database, entryId: number): Promise<string[]> {
  const { results } = await db.prepare('SELECT tag FROM character_tags WHERE entry_id = ? ORDER BY tag').bind(entryId).all<{ tag: string }>()
  return results.map(row => row.tag)
}

export async function saveTags(db: D1Database, entryId: number, tags: string[]) {
  await db.prepare('DELETE FROM character_tags WHERE entry_id = ?').bind(entryId).run()
  if (!tags.length) return
  const now = new Date().toISOString()
  await db.prepare(`INSERT INTO character_tags (entry_id, tag, created_at) SELECT ?, value, ? FROM json_each(?)`).bind(entryId, now, JSON.stringify(tags)).run()
}
