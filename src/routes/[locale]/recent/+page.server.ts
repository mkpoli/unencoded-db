import { error } from '@sveltejs/kit'
import { recent } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { revisionFields } from '$lib/server/revisions'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const { rows, next } = await recent(env(event).DB, before)
  return {
    rows: rows.map(({ snapshot, sighting_rev, ...row }) => ({
      ...row,
      sightingRev: sighting_rev ?? null,
      ...revisionFields({ sighting_id: row.sighting_id, kind: row.kind, snapshot }),
    })),
    next,
  }
}
