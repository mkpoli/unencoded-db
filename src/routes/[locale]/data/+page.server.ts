import { datasetCounts } from '$lib/server/export'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB
  return { counts: db ? await datasetCounts(db) : { records: 0, evidence: 0 } }
}
