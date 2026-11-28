import { error, redirect } from '@sveltejs/kit'
import { recordCode } from '$lib/code'
import { entryStemma, STEMMA_HOPS_MAX, STEMMA_NODES_MAX } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { recordIdParam } from '../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = recordIdParam(event.params.code)
  if (!id) error(404)
  const found = await entryStemma(env(event).DB, id)
  if (!found) error(404)
  if (found.entry.merged_into) redirect(302, `/${event.params.locale}/${recordCode(found.entry.merged_into)}/stemma`)
  return {
    id,
    entry: found.entry,
    graph: found.graph,
    dates: found.dates,
    limits: { hops: STEMMA_HOPS_MAX, nodes: STEMMA_NODES_MAX },
  }
}
