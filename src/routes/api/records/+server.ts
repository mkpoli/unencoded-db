import { json } from '@sveltejs/kit'
import { list, tilesOf } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { positiveId, recordNamed } from '../../_submission.server'
import type { RequestHandler } from './$types'

/** How many records a picker lists for what is typed. */
const PICKED_MAX = 8
const QUERY_MAX = 200

// The records a picker offers for what is typed: the one it names by number, code or address first, then
// those the browse search finds. `exclude` leaves out the record the picker is on.
export const GET: RequestHandler = async (event) => {
  const query = (event.url.searchParams.get('q') ?? '').trim()
  if (!query || query.length > QUERY_MAX) return json([])
  const exclude = positiveId(event.url.searchParams.get('exclude'))
  const db = env(event).DB
  const named = recordNamed(query)
  const found = await list(db, { query, limit: PICKED_MAX + 1 })
  const ids = [...new Set([...(named ? [named] : []), ...(found?.tiles.map(tile => tile.id) ?? [])])].filter(id => id !== exclude)
  const tiles = await tilesOf(db, ids)
  return json(ids.flatMap(id => {
    const tile = tiles.get(id)
    return tile ? [{ id, ids: tile.ids, layout: tile.layout, cover_key: tile.cover_key }] : []
  }).slice(0, PICKED_MAX))
}
