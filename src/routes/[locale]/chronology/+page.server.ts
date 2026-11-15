import { error } from '@sveltejs/kit'
import { chroniclePlace, chronology } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  // ?at= is a place in the chronology, `year.record`; ?from= starts at a decade, written as its first year.
  const place = chroniclePlace(event.url.searchParams.get('at'), event.url.searchParams.get('from'))
  if (!place) error(404)
  const page = await chronology(env(event).DB, place)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.entries.map(entry => entry.tile), event.locals.glyphStyle)
  return { ...page, glyphs }
}
