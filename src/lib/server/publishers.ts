import { nameKey } from '../name-key'

const visible = 'EXISTS (SELECT 1 FROM sources s WHERE s.publisher_id = p.id AND s.records > 0)'

export async function publisherDirectory(db: D1Database, query = '') {
  const { results } = await db.prepare(`SELECT p.id, p.name,
    (SELECT json_group_array(spelling) FROM publisher_aliases a WHERE a.publisher_id = p.id) AS aliases
    FROM publishers p WHERE ${visible} AND (?1 = '' OR instr(p.lookup, ?1) > 0 OR EXISTS
      (SELECT 1 FROM publisher_aliases a WHERE a.publisher_id = p.id AND instr(a.lookup, ?1) > 0))
    ORDER BY p.name COLLATE NOCASE LIMIT 50`).bind(nameKey(query))
    .all<{ id: number; name: string; aliases: string }>()
  return results.map(p => ({ id: p.id, label: p.name, aliases: JSON.parse(p.aliases) as string[] }))
}

export function publicPublisher(db: D1Database, text: string) {
  return db.prepare(`SELECT p.id, p.name FROM publishers p WHERE p.id = CASE
    WHEN EXISTS (SELECT 1 FROM publisher_aliases WHERE lookup = ?1)
      THEN (SELECT publisher_id FROM publisher_aliases WHERE lookup = ?1)
    ELSE (SELECT id FROM publishers WHERE lookup = ?1) END AND ${visible}`)
    .bind(nameKey(text)).first<{ id: number; name: string }>()
}
