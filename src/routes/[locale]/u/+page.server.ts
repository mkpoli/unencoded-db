import { error } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { contributors, PEOPLE_PAGE, PEOPLE_PAGES } from '$lib/server/people'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const asked = event.url.searchParams.get('page')
  const page = asked === null ? 1 : positiveId(asked)
  if (!page || page > PEOPLE_PAGES) error(404)
  const found = await contributors(env(event).DB, page)
  if (page > 1 && !found.people.length) error(404)
  return { ...found, first: (page - 1) * PEOPLE_PAGE + 1 }
}
