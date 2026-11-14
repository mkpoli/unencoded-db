import { error } from '@sveltejs/kit'
import { sourcePage } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { cleanIds } from '$lib/ids'
import { positiveId } from '../../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.params.id)
  if (!id) error(404)
  const found = await sourcePage(env(event).DB, id)
  if (!found) error(404)
  const media = event.platform?.env?.MEDIA
  const ids = found.sightings.map(sighting => sighting.tile.ids).filter((value): value is string => Boolean(value)).map(cleanIds)
  const glyphs = await glyphPaths(media, ids)
  const missing = [...new Set(ids.filter(value => !glyphs[value]))]
  if (missing.length) event.platform?.ctx?.waitUntil(warmGlyphs(media, missing, { assets: event.platform?.env?.ASSETS, origin: event.url.origin }))
  return { ...found, glyphs }
}
