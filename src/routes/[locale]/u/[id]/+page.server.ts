import { error, redirect } from '@sveltejs/kit'
import { ofPerson } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { revisionFields } from '$lib/server/revisions'
import { positiveId } from '../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = event.params.id
  if (!/^[0-9a-f]{12}$/.test(id)) error(404)
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const found = await ofPerson(env(event).DB, id, before)
  if (!found) error(404)
  if (found.person.merged_into) redirect(302, `/${event.params.locale}/u/${found.person.merged_into}`)
  return {
    person: { id: found.person.id, name: found.person.name, created_at: found.person.created_at },
    rows: found.rows.map(({ snapshot, sighting_rev, ...row }) => ({
      ...row,
      sightingRev: sighting_rev ?? null,
      ...revisionFields({ sighting_id: row.sighting_id, kind: row.kind, snapshot }),
    })),
    next: found.next,
  }
}
