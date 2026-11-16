import { FAVOURITES_PAGE, favouriteEntries } from '$lib/server/favourites'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import type { Tile } from '$lib/server/entries'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const person = event.locals.person
  if (!person) {
    return { tiles: [] as Tile[], glyphs: {} as Record<string, string | null>, total: 0, offset: 0, next: null as number | null }
  }
  const page = await favouriteEntries(env(event).DB, person.id, 0, FAVOURITES_PAGE)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.tiles, event.locals.glyphStyle)
  return { ...page, glyphs }
}
