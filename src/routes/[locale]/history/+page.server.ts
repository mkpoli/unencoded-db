import { error } from '@sveltejs/kit'
import { fields } from '$lib/server/evidence'
import { publicEntryPredicate } from '$lib/server/visibility'
import { isLocale } from '$lib/i18n'
import type { RevisionSnapshot } from '$lib/revision'
import type { PageServerLoad } from './$types'

const PAGE = 20
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const FIRST = '9999-12-31T23:59:59.999Z'

function positive(value: string | null) {
  return value !== null && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null
}

export const load: PageServerLoad = async ({ params, platform, url }) => {
  if (!isLocale(params.locale)) error(404)
  if (!platform) error(500, 'Database unavailable')
  const before = url.searchParams.get('before')
  const entry = positive(url.searchParams.get('entry'))
  const revision = positive(url.searchParams.get('revision'))
  if (before !== null && (!ISO.test(before) || !entry || !revision)) error(404)
  if (before === null && (url.searchParams.has('entry') || url.searchParams.has('revision'))) error(404)
  const { results } = await platform.env.DB.prepare(
    `SELECT r.entry_id, r.revision, r.recorded_at, r.tombstone, ${fields.map(field => `r.${field}`).join(', ')}
     FROM entry_revisions r JOIN entries e ON e.id = r.entry_id AND ${publicEntryPredicate}
     WHERE (r.recorded_at, r.entry_id, r.revision) < (?, ?, ?)
     ORDER BY r.recorded_at DESC, r.entry_id DESC, r.revision DESC
     LIMIT ${PAGE + 1}`,
  ).bind(before ?? FIRST, entry ?? Number.MAX_SAFE_INTEGER, revision ?? Number.MAX_SAFE_INTEGER).all<Record<string, string | number | null> & { entry_id: number; revision: number; recorded_at: string; tombstone: number }>()
  const revisions: RevisionSnapshot[] = results.slice(0, PAGE).map(row => row.tombstone
    ? { entry_id: row.entry_id, revision: row.revision, recorded_at: row.recorded_at, tombstone: true as const }
    : { ...row, tombstone: false as const } as RevisionSnapshot)
  const last = revisions.at(-1)
  return {
    revisions,
    next: results.length > PAGE && last ? { recorded_at: last.recorded_at, entry_id: last.entry_id, revision: last.revision } : null,
  }
}
