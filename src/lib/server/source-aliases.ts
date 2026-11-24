import { sourceNameKey, titleReadingKey } from '../name-key'
import { sampledSightings } from './source-sightings'
import type { Source } from './entries'

// Read both indexed prefix ranges. A source may match several readings and its literal name.
const prefix = "lookup >= ? AND lookup < CAST(? || X'FF' AS TEXT)"
const readingMatches = `SELECT r.lookup, c.id AS source_id FROM source_title_readings r
  CROSS JOIN sources c ON c.title = r.title AND c.records > 0 WHERE ${prefix}`
export const sourceMatches = `SELECT source_id FROM source_search_names WHERE ${prefix}
  UNION ALL SELECT source_id FROM (${readingMatches})`

export function sourceMatchParams(text: string) {
  const literal = sourceNameKey(text), reading = titleReadingKey(text) || null
  return [literal, literal, reading, reading]
}

export const SOURCE_SUGGESTIONS = 24
export type NameCursor = [string, number]

type EvidenceSample = { thumb: string | null; entry: number; ids: string | null; page: string | null; place: string | null; via: number }
export type SourceMatch = Source & { lookup: string; alias: string | null; reading: string | null; records: number; evidence: EvidenceSample | null }
const sample = (via: boolean) => `SELECT x.thumb_key AS thumb, r.entry_id AS entry, e.ids, r.page, r.place, r.id AS sighting, ${via ? 1 : 0} AS via ${sampledSightings(via)}`

export async function suggestSources(db: D1Database, text: string, cursor: NameCursor | null = null) {
  const key = sourceNameKey(text), reading = titleReadingKey(text) || null
  if (!key || (cursor && !cursor[0].startsWith(key) && !(reading && cursor[0].startsWith(reading)))) return []
  const [after, id] = cursor ?? ['', 0]
  // Each source has one winning name across cursor pages. Prefer a matching shared reading.
  const { results } = await db.prepare(`WITH titles AS MATERIALIZED (
    SELECT title, coalesce(min(lookup) FILTER (WHERE generated = 0), min(lookup)) AS lookup FROM source_title_readings WHERE ${prefix} GROUP BY title
  )
  SELECT c.id, c.title, c.url, c.author, c.publisher, c.report_date, c.container, c.source_kind, c.records,
    (SELECT json_object('thumb', thumb, 'entry', entry, 'ids', ids, 'place', place, 'page', page, 'via', via)
      FROM (${sample(false)} UNION ALL ${sample(true)}) ORDER BY thumb IS NULL, via, sighting LIMIT 1) AS evidence,
    n.lookup, CASE WHEN r.generated = 1 THEN (
      SELECT spelling FROM source_aliases WHERE source_id = n.source_id AND lookup >= ?3
        AND lookup < CAST(?3 || X'FF' AS TEXT) ORDER BY lookup LIMIT 1) ELSE a.spelling END AS alias,
    CASE WHEN r.generated = 0 THEN r.spelling END AS reading FROM (
      SELECT lookup, source_id FROM source_search_names candidate
      WHERE lookup < CAST(?3 || X'FF' AS TEXT)
        AND (lookup, source_id) > (max(?3, ?4), CASE WHEN ?4 >= ?3 THEN ?5 ELSE 0 END)
        AND NOT EXISTS (SELECT 1 FROM titles t WHERE t.lookup <> candidate.lookup
          AND t.title = (SELECT title FROM sources WHERE id = candidate.source_id))
        AND NOT EXISTS (SELECT 1 FROM source_search_names earlier WHERE earlier.source_id = candidate.source_id
          AND earlier.lookup >= ?3 AND earlier.lookup < candidate.lookup)
      UNION SELECT t.lookup, c.id FROM titles t CROSS JOIN sources c
        ON c.id IN (SELECT id FROM sources WHERE title = t.title AND records > 0
          AND id > CASE WHEN t.lookup = ?4 THEN ?5 ELSE 0 END ORDER BY id LIMIT ?6)
        WHERE t.lookup >= ?4
      ORDER BY lookup, source_id LIMIT ?6
    ) n CROSS JOIN sources c ON c.id = n.source_id
    LEFT JOIN source_aliases a ON a.source_id = n.source_id AND a.lookup = n.lookup
    LEFT JOIN source_title_readings r ON r.title = c.title AND r.lookup = n.lookup
    ORDER BY n.lookup, n.source_id`)
    .bind(reading, reading, key, after, id, SOURCE_SUGGESTIONS + 1).all<Omit<SourceMatch, 'evidence'> & { evidence: string | null }>()
  return results.map(({ evidence, ...row }): SourceMatch => ({ ...row, evidence: evidence ? JSON.parse(evidence) : null }))
}

export async function sourceAliases(db: D1Database, id: number) {
  const { results } = await db.prepare('SELECT spelling FROM source_aliases WHERE source_id = ? ORDER BY lookup')
    .bind(id).all<{ spelling: string }>()
  return results.map(row => row.spelling)
}

export async function sourceAliasChanges(db: D1Database, id: number, before: number | null) {
  const { results } = await db.prepare(`SELECT h.id, h.spelling, h.removed, h.at, coalesce(m.id, p.id) AS actor,
    coalesce(m.name, p.name) AS name FROM source_alias_changes h JOIN people p ON h.actor = p.id
    LEFT JOIN people m ON m.id = p.merged_into WHERE h.source_id = ? AND h.id < ? ORDER BY h.id DESC LIMIT 51`)
    .bind(id, before ?? Number.MAX_SAFE_INTEGER).all<{ id: number; spelling: string; removed: number; at: string; actor: string; name: string }>()
  return { changes: results.slice(0, 50), older: results.length > 50 ? results[49].id : null }
}

export async function editSourceAlias(db: D1Database, id: number, text: string, remove: boolean, actor: string) {
  const spelling = text.trim(), key = sourceNameKey(spelling)
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
