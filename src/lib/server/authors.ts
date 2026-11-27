import { authorNamed, nameKey } from '../name-key'

// The authors the sources of visible records name, each spelling once, found by a name, an account or a number.
// source_keys_by_author holds the keys authors of visible sources give. Every step is one seek to the next distinct
// key in it, and the first source with that key spells the author, so a sender of many messages costs the same as
// one of few.
const SUGGESTIONS = 25
export async function authorSuggestions(db: D1Database, query: string) {
  const key = nameKey(query)
  if (!key) return []
  const within = `author = 1 AND lookup < CAST(?1 || X'FF' AS TEXT)`
  const { results } = await db.prepare(`WITH RECURSIVE keys(lookup) AS (
      SELECT min(lookup) FROM source_keys WHERE lookup >= ?1 AND ${within}
      UNION ALL
      SELECT (SELECT min(lookup) FROM source_keys WHERE lookup > keys.lookup AND ${within}) FROM keys WHERE keys.lookup IS NOT NULL
    )
    SELECT k.lookup, c.author FROM (SELECT lookup FROM keys WHERE lookup IS NOT NULL LIMIT ${SUGGESTIONS}) k
    CROSS JOIN sources c ON c.id = (SELECT source_id FROM source_keys WHERE lookup = k.lookup AND author = 1 ORDER BY source_id LIMIT 1)`)
    .bind(key).all<{ lookup: string; author: string }>()
  return [...new Set(results.map(row => authorNamed(row.author, row.lookup)))].map(label => ({ label }))
}
