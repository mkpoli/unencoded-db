import { error } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { listImports } from '$lib/server/imports'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const rawAfter = event.url.searchParams.get('after')
  const after = rawAfter === null ? null : positiveId(rawAfter)
  if (rawAfter !== null && !after) error(404)
  return await listImports(env(event).DB, after)
}
