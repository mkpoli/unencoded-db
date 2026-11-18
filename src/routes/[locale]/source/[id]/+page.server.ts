import { readDates } from '$lib/server/date-readings'
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
  const glyphs = await tileGlyphs(event.platform, event.url.origin, found.sightings.map(sighting => sighting.tile), event.locals.glyphStyle)
  const dates = await readDates(env(event).DB, [found.source.report_date, ...found.sightings.map(s => s.original_date)])
  return { ...found, glyphs, dates }
}
