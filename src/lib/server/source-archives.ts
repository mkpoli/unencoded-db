import { ARCHIVES_MAX, archiveUrl } from '../source-archives'

// Archive copies of a source, with who added or removed each. Nothing here fetches the addresses.
export type ArchiveEdit = 'ok' | 'invalid' | 'duplicate' | 'full' | 'missing'
// What keeps a guarded add out: for 'first', any copy the source holds or once held; for 'wayback', a
// Wayback Machine copy in either scheme.
export type ArchiveGuard = 'first' | 'wayback'
const HELD: Record<ArchiveGuard, string> = {
  first: 'EXISTS (SELECT 1 FROM source_archives WHERE source_id = ?1) OR EXISTS (SELECT 1 FROM source_archive_changes WHERE source_id = ?1)',
  wayback: `EXISTS (SELECT 1 FROM source_archives WHERE source_id = ?1 AND (url LIKE 'https://web.archive.org/%' OR url LIKE 'http://web.archive.org/%'))`,
}

export async function sourceArchives(db: D1Database, id: number) {
  const { results } = await db.prepare('SELECT url FROM source_archives WHERE source_id = ? ORDER BY url')
    .bind(id).all<{ url: string }>()
  return results.map(row => row.url)
}

// The copies of the public sources a record page cites, by source, in one statement. The page names at most
// SIGHTINGS_MAX sightings of 1 + VIAS_MAX sources, each source holds at most ARCHIVES_MAX copies, and each
// source named costs a lookup by `sources` key and one by the key of `source_archives`.
export async function archivesOfSources(db: D1Database, ids: readonly number[]) {
  const found = new Map<number, string[]>()
  if (!ids.length) return found
  const { results } = await db.prepare(`SELECT a.source_id, a.url FROM json_each(?) j CROSS JOIN sources c ON c.id = j.value
    CROSS JOIN source_archives a ON a.source_id = c.id WHERE c.records > 0`).bind(JSON.stringify([...new Set(ids)])).all<{ source_id: number; url: string }>()
  for (const { source_id, url } of results) found.set(source_id, [...(found.get(source_id) ?? []), url])
  for (const urls of found.values()) urls.sort()
  return found
}

export async function sourceArchiveChanges(db: D1Database, id: number, before: number | null) {
  const { results } = await db.prepare(`SELECT h.id, h.url, h.removed, h.at, coalesce(m.id, p.id) AS actor,
    coalesce(m.name, p.name) AS name FROM source_archive_changes h JOIN people p ON h.actor = p.id
    LEFT JOIN people m ON m.id = p.merged_into WHERE h.source_id = ? AND h.id < ? ORDER BY h.id DESC LIMIT 51`)
    .bind(id, before ?? Number.MAX_SAFE_INTEGER).all<{ id: number; url: string; removed: number; at: string; actor: string; name: string }>()
  return { changes: results.slice(0, 50), older: results.length > 50 ? results[49].id : null }
}

// An add with a `guard` is refused, in the same statement, when the source holds what the guard names.
export async function editSourceArchive(db: D1Database, id: number, text: string, remove: boolean, actor: string, guard: ArchiveGuard | null = null): Promise<ArchiveEdit> {
  const url = archiveUrl(text)
  if (!url) return 'invalid'
  const live = 'EXISTS (SELECT 1 FROM sources WHERE id = ?1 AND records > 0)'
  // The mutation and journal share one D1 transaction.
  const changed = remove
    ? db.prepare(`INSERT INTO source_archive_changes(source_id, url, removed, actor)
        SELECT source_id, url, 1, ?3 FROM source_archives WHERE source_id = ?1 AND url = ?2 AND ${live} RETURNING id`).bind(id, url, actor)
    : db.prepare(`INSERT INTO source_archives(source_id, url)
        SELECT ?1, ?2 WHERE ${live} AND (SELECT count(*) FROM source_archives WHERE source_id = ?1) < ${ARCHIVES_MAX}${guard ? ` AND NOT (${HELD[guard]})` : ''}
        ON CONFLICT DO NOTHING RETURNING source_id`).bind(id, url)
  const finish = remove
    ? db.prepare('DELETE FROM source_archives WHERE source_id = ? AND url = ? AND changes() = 1').bind(id, url)
    : db.prepare('INSERT INTO source_archive_changes(source_id, url, removed, actor) SELECT ?, ?, 0, ? WHERE changes() = 1').bind(id, url, actor)
  const [result] = await db.batch([changed, finish])
  if (result.results.length) return 'ok'
  if (remove) return 'missing'
  // Read why an address was refused only after the refusal.
  const held = await db.prepare(`SELECT EXISTS (SELECT 1 FROM sources WHERE id = ?1 AND records > 0) AS live,
    EXISTS (SELECT 1 FROM source_archives WHERE source_id = ?1 AND url = ?2) ${guard ? `OR (${HELD[guard]}) ` : ''}AS taken,
    (SELECT count(*) FROM source_archives WHERE source_id = ?1) AS n`).bind(id, url).first<{ live: number; taken: number; n: number }>()
  return !held?.live ? 'missing' : held.taken ? 'duplicate' : held.n >= ARCHIVES_MAX ? 'full' : 'missing'
}
