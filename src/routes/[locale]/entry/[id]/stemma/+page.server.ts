import { error, redirect } from '@sveltejs/kit'
import { entryStemma, STEMMA_HOPS_MAX, STEMMA_NODES_MAX } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { positiveId } from '../../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await entryStemma(env(event).DB, id)
  if (!found) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/entry/${found.entry.merged_into}/stemma`)
  return {
    id,
    entry: found.entry,
    graph: found.graph,
    dates: found.dates,
    limits: { hops: STEMMA_HOPS_MAX, nodes: STEMMA_NODES_MAX },
  }
}
