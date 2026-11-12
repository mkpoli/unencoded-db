import { error } from '@sveltejs/kit'
import { list } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { cleanIds } from '$lib/ids'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

// The records filed under the `extension-e` collection, listed the way the gallery lists them.
export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const page = await list(env(event).DB, { script: 'han', facet: 'c:extension-e', before })
  if (!page) error(404)
  const media = event.platform?.env?.MEDIA
  const ids = page.tiles.map(tile => tile.ids).filter((id): id is string => Boolean(id)).map(cleanIds)
  const glyphs = await glyphPaths(media, ids)
  const missing = [...new Set(ids.filter(id => !glyphs[id]))]
  if (missing.length) event.platform?.ctx?.waitUntil(warmGlyphs(media, missing))
  return { ...page, glyphs }
}
