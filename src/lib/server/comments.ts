// The discussion of a record: comments in the order they were written, each by whoever wrote it.
import { COMMENT_MAX, COMMENTS_SHOWN } from '$lib/comments'

export type Comment = { id: number; entry_id: number; sighting_id: number | null; body: string; at: string; hidden_at: string | null; by_id: string; by_name: string }

export function cleanComment(input: unknown) {
  const body = typeof input === 'string' ? input.normalize('NFC').replace(/\r\n?/g, '\n').trim() : ''
  return body && body.length <= COMMENT_MAX ? body : null
}

export async function addComment(db: D1Database, target: { entry: number; sighting?: number | null }, body: string, who: { actor: string; ip: string | null }) {
  // Evidence that moved while its form was open is commented on where it is now.
  const row = await db.prepare('INSERT INTO comments(entry_id, first_entry, sighting_id, body, author, at, ip_hash) VALUES(COALESCE((SELECT entry_id FROM sightings WHERE id = ?2), ?1), COALESCE((SELECT first_entry FROM sightings WHERE id = ?2), ?1), ?2, ?3, ?4, ?5, ?6) RETURNING id')
    .bind(target.entry, target.sighting ?? null, body, who.actor, new Date().toISOString(), who.ip).first<{ id: number }>()
  return row!.id
}

/** The latest comments of a record, oldest first. A moderator also reads the hidden ones. */
export async function commentsOf(db: D1Database, entry: number, hidden = false) {
  const { results } = await db.prepare(`SELECT c.id, c.entry_id, c.sighting_id, c.body, c.at, c.hidden_at, COALESCE(m.id, p.id) AS by_id, COALESCE(m.name, p.name) AS by_name FROM comments c LEFT JOIN people p ON p.id = c.author LEFT JOIN people m ON m.id = p.merged_into WHERE c.entry_id = ? ${hidden ? '' : 'AND c.hidden_at IS NULL'} ORDER BY c.id DESC LIMIT ?`)
    .bind(entry, COMMENTS_SHOWN).all<Comment>()
  return results.reverse()
}

export async function setCommentHidden(db: D1Database, entry: number, id: number, hidden: boolean, by: string) {
  return Boolean(await db.prepare('UPDATE comments SET hidden_at = ?, hidden_by = ? WHERE id = ? AND entry_id = ? RETURNING id')
    .bind(hidden ? new Date().toISOString() : null, hidden ? by : null, id, entry).first())
}
