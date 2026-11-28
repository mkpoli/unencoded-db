import { env } from '$lib/server/guard'
import { listParts } from '$lib/server/parts'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const parts = await listParts(env(event).DB)
  return { parts }
}
