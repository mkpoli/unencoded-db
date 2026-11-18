import { readDates } from '$lib/server/date-readings'
import { error } from '@sveltejs/kit'
import { chroniclePlace, chronology } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  // ?at= reads from a place in the chronology, `year.record`, ?before= the rows before one, and ?from= starts at a decade.
  const { searchParams } = event.url
  const place = chroniclePlace(searchParams.get('at'), searchParams.get('before'), searchParams.get('from'))
  if (!place) error(404)
  const page = await chronology(env(event).DB, place)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.entries.map(entry => entry.tile), event.locals.glyphStyle)
  const dates = await readDates(env(event).DB, page.entries.flatMap(e => e.sighting ? [e.sighting.date, ...e.sighting.vias.map(via => via.report_date)] : []))
  return { ...page, glyphs, dates }
}
