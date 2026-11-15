import { error } from '@sveltejs/kit'
import { parseSourceCursor, sourceList } from '$lib/server/entries'
import { sourceSortOf } from '$lib/order'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const sort = sourceSortOf(event.url.searchParams.get('sort')), after = event.url.searchParams.get('after')
  if (!sort) error(404)
  const cursor = after === null ? null : parseSourceCursor(sort, after)
  if (after !== null && !cursor) error(404)
  const page = await sourceList(env(event).DB, sort, cursor)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.sources.flatMap(source => source.tiles))
  return { ...page, sort, glyphs }
}
