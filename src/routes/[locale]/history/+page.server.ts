import { error } from '@sveltejs/kit'
import { globalScope, historyBy } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tagList } from '$lib/server/tags'
import { feedCursor, feedPage } from '$lib/server/revisions'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const cursor = feedCursor(event.url)
  const by = historyBy(event.url.searchParams.get('by'))
  if (!cursor || by === undefined) error(404)
  const [page, tags] = await Promise.all([feedPage(env(event).DB, globalScope(by), cursor), tagList(env(event).DB)])
  return { ...page, by, tags: tags.map(({ name, label, type }) => ({ name, label, type })) }
}
