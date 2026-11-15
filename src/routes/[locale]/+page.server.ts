import { error, redirect } from '@sveltejs/kit'
import { counts, exactSearchIds, facetTag, list, listTag, markTags, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, terms } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { glyphPaths, warmGlyphs } from '$lib/server/glyphs'
import { cleanIds } from '$lib/ids'
import { parseRecordCode } from '$lib/code'
import { positiveId } from '../_submission.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const { searchParams } = event.url
  // Records are Han only until other scripts are opened for browsing.
  const script = 'han'
  const filter = searchParams.get('filter') || null
  // A category, a collection or a tag narrows the list: ?genre=, ?collection=, ?tag=.
  const genre = searchParams.get('genre'), collection = searchParams.get('collection'), tag = searchParams.get('tag')
  const facet = genre ? `g:${genre}` : collection ? `c:${collection}` : tag ? `t:${tag}` : null
  // A marked work keeps the list to the records in it or to the ones not in it: ?in=, ?out=, each as often as needed.
  const within = [...new Set(searchParams.getAll('in'))], without = [...new Set(searchParams.getAll('out'))]
  const query = (searchParams.get('q') ?? '').trim()
  const cursor = searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  if (!listTag(script, filter) || facetTag(facet) === undefined || !markTags(within, without)) error(404)
  const exact = query.length <= SEARCH_LENGTH_MAX && exactSearchIds(query)
  const words = query.length <= SEARCH_LENGTH_MAX && !exact ? new Set(terms(query)) : new Set<string>()
  const searchError = query.length > SEARCH_LENGTH_MAX ? 'queryTooLong' : !exact && query && words.size === 0 ? 'noSearchTerms' : words.size > SEARCH_TERMS_MAX ? 'tooManyTerms' : null
  const db = env(event).DB
  // A record's code typed whole, R+0022 or 天天玄玄, opens the record it names.
  const coded = before === null ? parseRecordCode(query) : null
  // A merged record opens the one it was merged into, and neither may be hidden.
  const named = coded ? await db.prepare('SELECT COALESCE(m.id, e.id) AS id FROM entries e LEFT JOIN entries m ON m.id = e.merged_into WHERE e.id = ? AND e.hidden_at IS NULL AND (e.merged_into IS NULL OR m.hidden_at IS NULL)').bind(coded).first<{ id: number }>() : null
  if (named) redirect(303, `/${event.params.locale}/entry/${named.id}`)
  const [page, totals] = await Promise.all([searchError ? null : list(db, { script, filter, facet, within, without, query, before }), counts(db)])
  if (!page && !searchError) error(404)
  const media = event.platform?.env?.MEDIA
  const ids = (page?.tiles.map(tile => tile.ids).filter((id): id is string => Boolean(id)) ?? []).map(cleanIds)
  const glyphs = await glyphPaths(media, ids)
  const missing = [...new Set(ids.filter(id => !glyphs[id]))]
  if (missing.length) event.platform?.ctx?.waitUntil(warmGlyphs(media, missing, { assets: event.platform?.env?.ASSETS, origin: event.url.origin }))
  return { ...(page ?? { tiles: [], next: null, partial: false }), counts: totals, glyphs, filter, genre, collection, tag, within, without, query, searchError, continued: before !== null && query.length > 0 }
}
