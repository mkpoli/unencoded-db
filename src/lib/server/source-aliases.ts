import { nameKey } from '../name-key'
import type { Source } from './entries'

const prefix = "lookup >= ? AND lookup < CAST(? || X'FF' AS TEXT)"
export const sourceMatches = `SELECT source_id FROM source_search_names WHERE ${prefix}`
export const SOURCE_SUGGESTIONS = 24
export type NameCursor = [string, number]

export async function suggestSources(db: D1Database, text: string, cursor: NameCursor | null = null) {
  const key = nameKey(text)
  if (!key || (cursor && !cursor[0].startsWith(key))) return []
  const { results } = await db.prepare(`SELECT s.id, s.title, s.url, s.author, s.publisher, s.report_date,
    n.lookup, a.spelling AS alias FROM (
      SELECT lookup, source_id FROM source_search_names
      WHERE lookup < CAST(? || X'FF' AS TEXT) AND (lookup, source_id) > (?, ?)
      ORDER BY lookup, source_id LIMIT ?
    ) n CROSS JOIN sources s ON s.id = n.source_id
    LEFT JOIN source_aliases a ON a.source_id = n.source_id AND a.lookup = n.lookup
    ORDER BY n.lookup, n.source_id`)
    .bind(key, cursor?.[0] ?? key, cursor?.[1] ?? 0, SOURCE_SUGGESTIONS + 1).all<Source & { lookup: string; alias: string | null }>()
  return results
}

export async function sourceAliases(db: D1Database, id: number) {
  const { results } = await db.prepare('SELECT spelling FROM source_aliases WHERE source_id = ? ORDER BY lookup')
    .bind(id).all<{ spelling: string }>()
  return results.map(row => row.spelling)
}

export async function sourceAliasChanges(db: D1Database, id: number) {
  const { results } = await db.prepare(`SELECT h.id, h.spelling, h.removed, h.at, coalesce(m.id, p.id) AS actor,
    coalesce(m.name, p.name) AS name FROM source_alias_changes h JOIN people p ON h.actor = p.id
    LEFT JOIN people m ON m.id = p.merged_into WHERE h.source_id = ? ORDER BY h.id DESC LIMIT 50`)
    .bind(id).all<{ id: number; spelling: string; removed: number; at: string; actor: string; name: string }>()
  return results
}

export async function editSourceAlias(db: D1Database, id: number, text: string, remove: boolean, actor: string) {
  const spelling = text.trim(), key = nameKey(spelling)
  if (!key || spelling.length > 300 || key.length > 300) return false
  const live = 'EXISTS (SELECT 1 FROM sources WHERE id = ?1 AND records > 0)'
  // Log the stored spelling on removal. The mutation and journal share one D1 transaction.
  const changed = remove
    ? db.prepare(`INSERT INTO source_alias_changes(source_id, spelling, removed, actor)
        SELECT source_id, spelling, 1, ?3 FROM source_aliases WHERE source_id = ?1 AND lookup = ?2 AND ${live} RETURNING id`).bind(id, key, actor)
    : db.prepare(`INSERT INTO source_aliases(source_id, lookup, spelling)
        SELECT ?1, ?2, ?3 WHERE ${live} AND (SELECT count(*) FROM source_aliases WHERE source_id = ?1) < 50
        ON CONFLICT DO NOTHING RETURNING source_id`).bind(id, key, spelling)
  const finish = remove
    ? db.prepare('DELETE FROM source_aliases WHERE source_id = ? AND lookup = ? AND changes() = 1').bind(id, key)
    : db.prepare('INSERT INTO source_alias_changes(source_id, spelling, removed, actor) SELECT ?, ?, 0, ? WHERE changes() = 1').bind(id, spelling, actor)
  const [result] = await db.batch([changed, finish])
  return result.results.length > 0
}
