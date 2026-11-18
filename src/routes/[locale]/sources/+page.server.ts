import { publicPublisher } from '$lib/server/publishers'
import { readDates } from '$lib/server/date-readings'
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
  const db = env(event).DB
  const typed = event.url.searchParams.get('publisher')?.trim() ?? ''
  const found = typed ? await publicPublisher(db, typed) : null
  const page = typed && !found ? { sources: [], next: null } : await sourceList(db, sort, cursor, found?.id ?? null)
  const publisher = found?.name ?? typed
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.sources.flatMap(source => source.tiles), event.locals.glyphStyle)
  const dates = await readDates(env(event).DB, page.sources.map(s => s.report_date))
  return { ...page, sort, glyphs, dates, publisher }
}
