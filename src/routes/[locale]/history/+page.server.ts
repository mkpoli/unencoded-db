import { error } from '@sveltejs/kit'
import { globalHistory, historyBy } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tagList } from '$lib/server/tags'
import { revisionDates, revisionFields } from '$lib/server/revisions'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const by = historyBy(event.url.searchParams.get('by'))
  if (by === undefined) error(404)
  const [{ rows, next }, tags] = await Promise.all([globalHistory(env(event).DB, before, by), tagList(env(event).DB)])
  const revisions = rows.map(({ snapshot, sighting_rev, ...row }) => ({
    ...row,
    sightingRev: sighting_rev ?? null,
    ...revisionFields({ sighting_id: row.sighting_id, kind: row.kind, snapshot }),
  }))
  return {
    rows: revisions,
    dates: await revisionDates(env(event).DB, revisions),
    next,
    by,
    tags: tags.map(({ name, label, type }) => ({ name, label, type })),
  }
}
