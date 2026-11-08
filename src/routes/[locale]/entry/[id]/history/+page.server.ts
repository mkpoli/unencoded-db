import { error } from '@sveltejs/kit'
import { fields } from '$lib/server/evidence'
import { publicEntryPredicate } from '$lib/server/visibility'
import { isLocale } from '$lib/i18n'
import type { PageServerLoad } from './$types'

function idOf(id: string) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) error(404)
  return Number(id)
}

export const load: PageServerLoad = async ({ params, platform, url }) => {
  if (!isLocale(params.locale)) error(404)
  if (!platform) error(500, 'Database unavailable')
  const before = url.searchParams.get('before')
  if (before !== null && (!/^[1-9]\d*$/.test(before) || !Number.isSafeInteger(Number(before)))) error(404)
  const id = idOf(params.id)
  const entry = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
  if (!entry) error(404)
  const { results } = await platform.env.DB.prepare(`SELECT r.entry_id, r.revision, r.recorded_at, r.tombstone, ${fields.map(field => `r.${field}`).join(', ')} FROM entry_revisions r JOIN entries e ON e.id = r.entry_id AND e.visible = 1 WHERE r.entry_id = ? AND r.revision < ? ORDER BY r.revision DESC LIMIT 21`).bind(id, before === null ? Number.MAX_SAFE_INTEGER : Number(before)).all<{ entry_id: number; revision: number; tombstone: number; script: string; ids: string | null; description: string | null; place: string; title: string | null; author: string | null; publisher: string | null; year: string | null; page: string | null; note: string | null; recorded_at: string }>()
  const revisions = results.slice(0, 20).map(row => row.tombstone
    ? { entry_id: row.entry_id, revision: row.revision, recorded_at: row.recorded_at, tombstone: true as const }
    : { ...row, tombstone: false as const })
  return { id, revisions, next: results.length > 20 ? revisions[revisions.length - 1].revision : null }
}
