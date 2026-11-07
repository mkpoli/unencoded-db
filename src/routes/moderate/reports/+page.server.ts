import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

type OpenReport = {
  report_id: number
  reason: string
  note: string
  created_at: string
  entry_id: number
  script: string
  description: string | null
  place: string
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  if (!locals.moderator) error(404)
  if (!platform) error(500, 'Database unavailable')

  const before = url.searchParams.get('before')
  const cursor = before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before))
    ? Number(before)
    : Number.MAX_SAFE_INTEGER
  const { results } = await platform.env.DB
    .prepare(`SELECT r.id AS report_id, r.reason, r.note, r.created_at,
                     e.id AS entry_id, e.script, e.description, e.place
              FROM entry_reports r
              JOIN entries e ON e.id = r.entry_id
              WHERE r.resolved_at IS NULL AND e.visible = 1 AND r.id < ?
              ORDER BY r.id DESC
              LIMIT 21`)
    .bind(cursor)
    .all<OpenReport>()

  return {
    reports: results.slice(0, 20),
    next: results.length > 20 ? results[19]!.report_id : null,
    moderator: locals.moderator,
  }
}
