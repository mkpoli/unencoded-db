import { categoryChanges, categoryList } from '$lib/server/categories'
import { env } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

// The categories with their counts, and the latest changes for the board.
export const load: PageServerLoad = async (event) => {
  const db = env(event).DB
  const [categories, changes] = await Promise.all([categoryList(db), categoryChanges(db)])
  return { categories, changes }
}
