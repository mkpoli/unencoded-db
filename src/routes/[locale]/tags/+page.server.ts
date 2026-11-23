import { env } from '$lib/server/guard'
import { tagChanges, taxonomy } from '$lib/server/tags'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const db = env(event).DB
  const [{ tags, groups }, changes] = await Promise.all([taxonomy(db, true), tagChanges(db)])
  return { tags, groups, changes }
}
