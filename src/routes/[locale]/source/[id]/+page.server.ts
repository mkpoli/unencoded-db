import { error } from '@sveltejs/kit'
import { sourcePage } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import { positiveId } from '../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await sourcePage(env(event).DB, id)
  if (!found) error(404)
  const glyphs = await tileGlyphs(event.platform, found.sightings.map(sighting => sighting.tile))
  return { ...found, glyphs }
}
