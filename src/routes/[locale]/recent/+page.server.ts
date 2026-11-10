import { error } from '@sveltejs/kit'
import { recent } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  return recent(env(event).DB, before)
}
