import { json } from '@sveltejs/kit'
import { list, tilesOf } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { positiveId, recordNamed } from '../../_submission.server'
import type { RequestHandler } from './$types'

/** How many records a picker lists for what is typed. */
const PICKED_MAX = 8
const QUERY_MAX = 200
/** How many search windows a request reads, newest first, to find them: the browse page reads on as the reader scrolls. */
const READS_MAX = 8

// The records a picker offers for what is typed: the one it names by number, code or address first, then
// those the browse search finds. `exclude` leaves out the record the picker is on.
export const GET: RequestHandler = async (event) => {
  const query = (event.url.searchParams.get('q') ?? '').trim()
  if (!query || query.length > QUERY_MAX) return json([])
  const exclude = positiveId(event.url.searchParams.get('exclude'))
  const db = env(event).DB
  const named = recordNamed(query)
  const ids = named ? [named] : []
  let after: string | null = null
  for (let read = 0; read < READS_MAX && ids.length <= PICKED_MAX; read++) {
    const found = await list(db, { query, after, limit: PICKED_MAX + 1 })
    if (!found) break
    ids.push(...found.tiles.map(tile => tile.id))
    if (!found.next) break
    after = found.next
  }
  const picked = [...new Set(ids)].filter(id => id !== exclude)
  const tiles = await tilesOf(db, picked)
  return json(picked.flatMap(id => {
    const tile = tiles.get(id)
    return tile ? [{ id, ids: tile.ids, layout: tile.layout, cover_key: tile.cover_key }] : []
  }).slice(0, PICKED_MAX))
}
