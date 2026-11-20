import { error } from '@sveltejs/kit'
import { copyPage } from '$lib/server/digitized-copies'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import { positiveId } from '../../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('after')
  const after = cursor === null ? 0 : positiveId(cursor)
  if (after === null) error(404)
  const found = await copyPage(env(event).DB, event.params.slug, after)
  if (!found) error(404)
  const tiles = found.sightings.map(({ entry_id, ids, layout }) => ({ id: entry_id, ids, layout }))
  const glyphs = await tileGlyphs(event.platform, event.url.origin, tiles, event.locals.glyphStyle)
  return { ...found, glyphs }
}
