// Tags already carried by other visible records citing the same source(s).
// Reads at most SOURCE_TAG_READ sightings per source from `sightings_by_source`, joins visible records
// and their `tag` claims by key, and keeps tags on at least half of that source's records.

export const SOURCE_TAG_READ = 128
export const SOURCE_TAG_LIMIT = 5
export const SOURCE_TAG_SOURCES_MAX = 5

export type SourceTagRow = { entry_id: number; tag: string | null }

export const sourceTagStatement = (db: D1Database, sourceId: number, excludeEntryId: number | null = null) =>
  db.prepare(`SELECT e.id AS entry_id, k.value AS tag
    FROM (
      SELECT s.entry_id, s.hidden_at
      FROM sightings s INDEXED BY sightings_by_source
      WHERE s.source_id = ?1
      ORDER BY s.id DESC
      LIMIT ${SOURCE_TAG_READ}
    ) sample
    CROSS JOIN entries e ON e.id = sample.entry_id
    LEFT JOIN claims k ON k.entry_id = e.id AND +k.kind = 'tag'
    WHERE sample.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL AND e.id <> ?2`)
    .bind(sourceId, excludeEntryId ?? 0)

export function commonTagsOfRows(rows: readonly SourceTagRow[]) {
  const records = new Set<number>()
  const byTag = new Map<string, Set<number>>()
  for (const row of rows) {
    records.add(row.entry_id)
    if (row.tag) {
      let held = byTag.get(row.tag)
      if (!held) { held = new Set(); byTag.set(row.tag, held) }
      held.add(row.entry_id)
    }
  }
  const total = records.size
  if (!total) return []
  const kept: { tag: string; count: number; ratio: number }[] = []
  for (const [tag, held] of byTag) {
    if (held.size * 2 >= total) kept.push({ tag, count: held.size, ratio: held.size / total })
  }
  return kept
}

export async function sourceTagHints(db: D1Database, sourceIds: number | readonly number[], excludeEntryId: number | null = null): Promise<string[]> {
  const ids = [...new Set(Array.isArray(sourceIds) ? sourceIds : [sourceIds])]
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .slice(0, SOURCE_TAG_SOURCES_MAX)
  if (!ids.length) return []
  const statements = ids.map(id => sourceTagStatement(db, id, excludeEntryId))
  const results = statements.length === 1
    ? [await statements[0].all<SourceTagRow>()]
    : await db.batch<SourceTagRow>(statements)
  const best = new Map<string, { count: number; ratio: number }>()
  for (const { results: rows } of results) {
    for (const item of commonTagsOfRows(rows)) {
      const prior = best.get(item.tag)
      if (!prior || item.ratio > prior.ratio || (item.ratio === prior.ratio && item.count > prior.count)) {
        best.set(item.tag, { count: item.count, ratio: item.ratio })
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1].ratio - a[1].ratio || b[1].count - a[1].count || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, SOURCE_TAG_LIMIT)
    .map(([tag]) => tag)
}
