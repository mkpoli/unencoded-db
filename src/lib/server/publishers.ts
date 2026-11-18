import { nameKey } from '../name-key'

// A UTF-8 name beginning with the query sorts below the same prefix followed by FF.
// Limit each index range before combining the two lists.
const SUGGESTIONS = 100
export function publisherSuggestions(db: D1Database, query: string) {
  const key = nameKey(query)
  const prefix = (column: string) => `${column} >= ?1 AND ${column} < CAST(?1 || X'FF' AS TEXT)`
  const candidates = key ? `WITH canonical AS (
    SELECT id FROM publishers WHERE listed = 1 AND ${prefix('lookup')} ORDER BY lookup LIMIT ${SUGGESTIONS}
  ), alternatives AS (
    SELECT a.publisher_id AS id FROM publisher_aliases a CROSS JOIN publishers p ON p.id = a.publisher_id
    WHERE p.listed = 1 AND ${prefix('a.lookup')} ORDER BY a.lookup LIMIT ${SUGGESTIONS}
  ) SELECT id FROM canonical UNION SELECT id FROM alternatives`
    : `SELECT id FROM publishers WHERE listed = 1 ORDER BY lookup LIMIT ${SUGGESTIONS}`

  const statement = db.prepare(`SELECT p.id, p.name,
    (SELECT json_group_array(spelling) FROM publisher_aliases a WHERE a.publisher_id = p.id) AS aliases
    FROM (${candidates}) m CROSS JOIN publishers p ON p.id = m.id ORDER BY p.lookup LIMIT ${SUGGESTIONS}`)
  return key ? statement.bind(key) : statement
}

export async function publisherDirectory(db: D1Database, query = '') {
  const { results } = await publisherSuggestions(db, query).all<{ id: number; name: string; aliases: string }>()
  return results.map(p => ({ id: p.id, label: p.name, aliases: JSON.parse(p.aliases) as string[] }))
}

export function publicPublisher(db: D1Database, text: string) {
  return db.prepare(`SELECT p.id, p.name FROM publishers p WHERE p.id = CASE
    WHEN EXISTS (SELECT 1 FROM publisher_aliases WHERE lookup = ?1)
      THEN (SELECT publisher_id FROM publisher_aliases WHERE lookup = ?1)
    ELSE (SELECT id FROM publishers WHERE lookup = ?1) END AND p.listed = 1`)
    .bind(nameKey(text)).first<{ id: number; name: string }>()
}
