import { error } from '@sveltejs/kit'
import { SOURCE_GRAPH_EDGES_LIMIT, SOURCE_GRAPH_HOPS_LIMIT, SOURCE_GRAPH_NODES_LIMIT } from '$lib/source-graph'
import { readDates } from '$lib/server/date-readings'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import { sourceGraph, SOURCE_PAIR_LIMIT, sourcePairSightings } from '$lib/server/source-graph'
import { positiveId } from '../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const sourceParam = event.url.searchParams.get('source')
  const citingParam = event.url.searchParams.get('citing')
  const citedParam = event.url.searchParams.get('cited')

  if ((citingParam !== null) !== (citedParam !== null)) error(404)
  if (sourceParam !== null && citingParam !== null) error(404)

  const focusParamId = sourceParam === null ? null : positiveId(sourceParam)
  if (sourceParam !== null && !focusParamId) error(404)
  const citingId = citingParam === null ? null : positiveId(citingParam)
  const citedId = citedParam === null ? null : positiveId(citedParam)
  if ((citingParam !== null && !citingId) || (citedParam !== null && !citedId)) error(404)
  if (citingId !== null && citedId !== null && citingId === citedId) error(404)

  const db = env(event).DB
  const effectiveFocus = focusParamId ?? citingId

  const [graphFound, pair] = await Promise.all([
    sourceGraph(db, effectiveFocus),
    citingId !== null && citedId !== null ? sourcePairSightings(db, citingId, citedId) : Promise.resolve(null),
  ])

  if (!graphFound) error(404)
  if (citingId !== null && citedId !== null && !pair) error(404)

  const pairDates = pair ? await readDates(db, [pair.citing.report_date, pair.cited.report_date, ...pair.items.map(item => item.original_date)]) : new Map()
  const dates = new Map([...graphFound.dates, ...pairDates])
  const glyphs = pair ? await tileGlyphs(event.platform, event.url.origin, pair.items.map(item => item.tile), event.locals.glyphStyle) : {}

  return {
    graph: graphFound.graph,
    dates,
    pair,
    glyphs,
    limits: {
      nodes: SOURCE_GRAPH_NODES_LIMIT,
      edges: SOURCE_GRAPH_EDGES_LIMIT,
      hops: SOURCE_GRAPH_HOPS_LIMIT,
      pair: SOURCE_PAIR_LIMIT,
    },
  }
}
