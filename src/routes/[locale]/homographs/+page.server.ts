import { error } from '@sveltejs/kit'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import { homographPage, parseHomographCursor } from '$lib/server/homographs'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const after = event.url.searchParams.get('after')
  const cursor = after === null ? null : parseHomographCursor(after)
  if (after !== null && !cursor) error(404)
  const page = await homographPage(env(event).DB, cursor)
  const glyphTargets = page.groups.flatMap(group => group.records.map(record => ({ id: record.id, ids: record.ids, layout: record.layout })))
  const glyphs = await tileGlyphs(event.platform, event.url.origin, glyphTargets, event.locals.glyphStyle)
  return { ...page, glyphs }
}
