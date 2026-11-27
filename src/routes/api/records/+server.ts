import { json } from '@sveltejs/kit'
import { alsoSearch, searchFound, tilesOf } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { positiveId, recordNamed } from '../../_submission.server'
import type { RequestHandler } from './$types'

/** How many records a picker lists for what is typed. */
const PICKED_MAX = 8
const QUERY_MAX = 200

// The records a picker offers for what is typed: the one it names by number, code or address first, then
// the newest the browse search finds, under the other spellings the browser found (`also`) too.
// `exclude` leaves out the record the picker is on.
export const GET: RequestHandler = async (event) => {
  const query = (event.url.searchParams.get('q') ?? '').trim()
  if (!query || query.length > QUERY_MAX) return json([])
  const exclude = positiveId(event.url.searchParams.get('exclude'))
  const db = env(event).DB
  const named = recordNamed(query)
  const also = alsoSearch(query, event.url.searchParams.getAll('also'))
  const found = await searchFound(db, { query, also }, PICKED_MAX + 2)
  const picked = [...new Set([...(named ? [named] : []), ...(found ?? [])])].filter(id => id !== exclude)
  const tiles = await tilesOf(db, picked)
  return json(picked.flatMap(id => {
    const tile = tiles.get(id)
    return tile ? [{ id, ids: tile.ids, layout: tile.layout, cover_key: tile.cover_key }] : []
  }).slice(0, PICKED_MAX))
}
