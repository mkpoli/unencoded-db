// A person's notices of comments, newest first.
import { UNREAD_SHOWN } from '$lib/notifications'

export const NOTIFICATIONS_PAGE = 50

// `kind` is 'comment' or the kind of the revision; `text` is the comment's opening or the revision's summary.
export type Notification = { id: number; read_at: string | null; kind: string; entry_id: number; sighting_id: number | null; comment_id: number | null; ids: string | null; text: string | null; at: string; by_id: string | null; by_name: string | null }

/** How many notices a person has not read, counted no further than one past what the badge shows. */
export async function unreadCount(db: D1Database, person: string) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM notifications WHERE person = ? AND read_at IS NULL LIMIT ?)').bind(person, UNREAD_SHOWN + 1).first<{ n: number }>()
  return row?.n ?? 0
}

export async function notificationsOf(db: D1Database, person: string, before: number | null = null) {
  const { results } = await db.prepare(`SELECT n.id, n.read_at, COALESCE(r.kind, 'comment') AS kind, e.id AS entry_id, COALESCE(c.sighting_id, r.sighting_id) AS sighting_id, c.id AS comment_id, e.ids,
      CASE WHEN c.id IS NOT NULL THEN substr(c.body, 1, 280) WHEN r.redacted_at IS NULL THEN r.summary END AS text, n.at, COALESCE(m.id, p.id) AS by_id, COALESCE(m.name, p.name) AS by_name
    FROM notifications n LEFT JOIN comments c ON c.id = n.comment_id LEFT JOIN revisions r ON r.id = n.revision_id JOIN entries e ON e.id = COALESCE(c.entry_id, r.entry_id)
      LEFT JOIN sightings s ON s.id = r.sighting_id LEFT JOIN people p ON p.id = COALESCE(c.author, r.actor) LEFT JOIN people m ON m.id = p.merged_into
    WHERE n.person = ? AND n.id < ? AND c.hidden_at IS NULL AND e.hidden_at IS NULL AND s.hidden_at IS NULL ORDER BY n.id DESC LIMIT ?`)
    .bind(person, before ?? Number.MAX_SAFE_INTEGER, NOTIFICATIONS_PAGE + 1).all<Notification>()
  return { notifications: results.slice(0, NOTIFICATIONS_PAGE), next: results.length > NOTIFICATIONS_PAGE ? results[NOTIFICATIONS_PAGE - 1].id : null }
}

/** The newest notice a person holds, shown or not: what a reading of the page reaches up to. */
export async function latestNotice(db: D1Database, person: string) {
  return (await db.prepare('SELECT MAX(id) AS id FROM notifications WHERE person = ?').bind(person).first<{ id: number | null }>())?.id ?? 0
}

/** Marks read what the page held when it was shown; a notice that came after stays unread. */
export async function markRead(db: D1Database, person: string, upto: number) {
  await db.prepare('UPDATE notifications SET read_at = ? WHERE person = ? AND read_at IS NULL AND id <= ?').bind(new Date().toISOString(), person, upto).run()
}
