import { env } from '$lib/server/guard'
import { tagChanges, tagList } from '$lib/server/tags'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const db = env(event).DB
  const [tags, changes] = await Promise.all([tagList(db, true), tagChanges(db)])
  return { tags, changes }
}
