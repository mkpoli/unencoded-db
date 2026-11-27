import { ARCHIVES_MAX, archiveUrl } from '../source-archives'

// Archive copies of a source, with who added or removed each. Nothing here fetches the addresses.
export type ArchiveEdit = 'ok' | 'invalid' | 'duplicate' | 'full' | 'missing'

export async function sourceArchives(db: D1Database, id: number) {
  const { results } = await db.prepare('SELECT url FROM source_archives WHERE source_id = ? ORDER BY url')
    .bind(id).all<{ url: string }>()
  return results.map(row => row.url)
}

export async function sourceArchiveChanges(db: D1Database, id: number, before: number | null) {
  const { results } = await db.prepare(`SELECT h.id, h.url, h.removed, h.at, coalesce(m.id, p.id) AS actor,
    coalesce(m.name, p.name) AS name FROM source_archive_changes h JOIN people p ON h.actor = p.id
    LEFT JOIN people m ON m.id = p.merged_into WHERE h.source_id = ? AND h.id < ? ORDER BY h.id DESC LIMIT 51`)
    .bind(id, before ?? Number.MAX_SAFE_INTEGER).all<{ id: number; url: string; removed: number; at: string; actor: string; name: string }>()
  return { changes: results.slice(0, 50), older: results.length > 50 ? results[49].id : null }
}

export async function editSourceArchive(db: D1Database, id: number, text: string, remove: boolean, actor: string): Promise<ArchiveEdit> {
  const url = archiveUrl(text)
  if (!url) return 'invalid'
  const live = 'EXISTS (SELECT 1 FROM sources WHERE id = ?1 AND records > 0)'
  // The mutation and journal share one D1 transaction.
  const changed = remove
    ? db.prepare(`INSERT INTO source_archive_changes(source_id, url, removed, actor)
        SELECT source_id, url, 1, ?3 FROM source_archives WHERE source_id = ?1 AND url = ?2 AND ${live} RETURNING id`).bind(id, url, actor)
    : db.prepare(`INSERT INTO source_archives(source_id, url)
        SELECT ?1, ?2 WHERE ${live} AND (SELECT count(*) FROM source_archives WHERE source_id = ?1) < ${ARCHIVES_MAX}
        ON CONFLICT DO NOTHING RETURNING source_id`).bind(id, url)
  const finish = remove
    ? db.prepare('DELETE FROM source_archives WHERE source_id = ? AND url = ? AND changes() = 1').bind(id, url)
    : db.prepare('INSERT INTO source_archive_changes(source_id, url, removed, actor) SELECT ?, ?, 0, ? WHERE changes() = 1').bind(id, url, actor)
  const [result] = await db.batch([changed, finish])
  if (result.results.length) return 'ok'
  if (remove) return 'missing'
  // Read why an address was refused only after the refusal.
  const held = await db.prepare(`SELECT EXISTS (SELECT 1 FROM sources WHERE id = ?1 AND records > 0) AS live,
    EXISTS (SELECT 1 FROM source_archives WHERE source_id = ?1 AND url = ?2) AS taken,
    (SELECT count(*) FROM source_archives WHERE source_id = ?1) AS n`).bind(id, url).first<{ live: number; taken: number; n: number }>()
  return !held?.live ? 'missing' : held.taken ? 'duplicate' : held.n >= ARCHIVES_MAX ? 'full' : 'missing'
}
