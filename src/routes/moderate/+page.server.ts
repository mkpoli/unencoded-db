import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { hiddenEntryPredicate } from '$lib/server/visibility'

type HiddenEntry = {
  id: number
  script: string
  description: string | null
  place: string
  created_at: string
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
  if (!locals.moderator) error(404)
  if (!platform) error(500, 'Database unavailable')

  const before = url.searchParams.get('before')
  const cursor = before && /^[1-9]\d*$/.test(before) && Number.isSafeInteger(Number(before))
    ? Number(before)
    : Number.MAX_SAFE_INTEGER
  const { results } = await platform.env.DB
    .prepare(`SELECT id, script, description, place, created_at FROM entries WHERE ${hiddenEntryPredicate} AND id < ? ORDER BY id DESC LIMIT 21`)
    .bind(cursor)
    .all<HiddenEntry>()

  return {
    entries: results.slice(0, 20),
    next: results.length > 20 ? results[19].id : null,
    moderator: locals.moderator,
  }
}
