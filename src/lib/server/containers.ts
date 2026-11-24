import { nameKey } from '../name-key'

// The containers the sources of visible records name, each once, with the publisher its first source gives. Every step is one
// seek to the next distinct name in the index, so a group with many messages costs the same as one with few.
const SUGGESTIONS = 25
export async function containerSuggestions(db: D1Database, query: string) {
  const key = nameKey(query)
  const within = `AND records > 0${key ? ` AND container_lookup < CAST(?1 || X'FF' AS TEXT)` : ''}`
  const { results } = await db.prepare(`WITH RECURSIVE names(lookup) AS (
      SELECT min(container_lookup) FROM sources WHERE container_lookup >= ?1 ${within}
      UNION ALL
      SELECT (SELECT min(container_lookup) FROM sources WHERE container_lookup > names.lookup ${within}) FROM names WHERE names.lookup IS NOT NULL
    )
    SELECT c.container AS label, c.publisher FROM (SELECT lookup FROM names WHERE lookup IS NOT NULL LIMIT ${SUGGESTIONS}) n
    CROSS JOIN sources c ON c.id = (SELECT id FROM sources WHERE container_lookup = n.lookup AND records > 0 ORDER BY id LIMIT 1)`)
    .bind(key).all<{ label: string; publisher: string | null }>()
  return results
}
