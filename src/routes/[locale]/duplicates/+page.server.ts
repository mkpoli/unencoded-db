import { error } from '@sveltejs/kit'
import { alikePage, parseAlikeCursor } from '$lib/server/alike'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const after = event.url.searchParams.get('after')
  const cursor = after === null ? null : parseAlikeCursor(after)
  if (after !== null && !cursor) error(404)
  const page = await alikePage(env(event).DB, cursor)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.groups.flatMap(group => group.records), event.locals.glyphStyle)
  return { ...page, glyphs }
}
