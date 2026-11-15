import { error } from '@sveltejs/kit'
import { chronology } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  // ?from= is the first decade of the page, written as its first year.
  const from = event.url.searchParams.get('from')
  if (from !== null && !/^(0|[1-9]\d{0,2}0)$/.test(from)) error(404)
  const page = await chronology(env(event).DB, from === null ? null : Number(from))
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.shown.flatMap(row => row.tiles), event.locals.glyphStyle)
  return { ...page, glyphs }
}
