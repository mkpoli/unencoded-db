import { error } from '@sveltejs/kit'
import { sourceList } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import { positiveId } from '../../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const page = await sourceList(env(event).DB, before)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.sources.flatMap(source => source.records))
  return { ...page, glyphs }
}
