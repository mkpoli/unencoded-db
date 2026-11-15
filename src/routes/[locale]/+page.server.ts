import { error, redirect } from '@sveltejs/kit'
import { counts, cursorOf, exactSearchIds, facetTag, list, listTag, markTags, radicalTag, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, terms } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import { parseRecordCode } from '$lib/code'
import { orderOf, seedOf } from '$lib/order'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const { searchParams } = event.url
  // Records are Han only until other scripts are opened for browsing.
  const script = 'han'
  const filter = searchParams.get('filter') || null
  // A category, a collection or a tag narrows the list: ?genre=, ?collection=, ?tag=.
  const genre = searchParams.get('genre'), collection = searchParams.get('collection'), tag = searchParams.get('tag')
  const facet = genre ? `g:${genre}` : collection ? `c:${collection}` : tag ? `t:${tag}` : null
  // A radical keeps the list to the records filed under its path: ?radical=儿兄克.
  const radical = searchParams.get('radical') || null
  // A marked work keeps the list to the records in it or to the ones not in it: ?in=, ?out=, each as often as needed.
  const within = [...new Set(searchParams.getAll('in'))], without = [...new Set(searchParams.getAll('out'))]
  const query = (searchParams.get('q') ?? '').trim()
  // ?sort= names an order other than the newest first; ?after= is the place a further page starts from.
  const order = orderOf(searchParams.get('sort'))
  const after = searchParams.get('after')
  if (!order || !cursorOf(order, after)) error(404)
  // A shuffled list is dealt a random start once, and the address keeps it for its further pages.
  const seed = order === 'random' ? seedOf(searchParams.get('seed')) : null
  if (order === 'random' && seed === null) {
    if (searchParams.has('seed') || after !== null) error(404)
    const dealt = new URL(event.url)
    dealt.searchParams.set('seed', String(crypto.getRandomValues(new Uint32Array(1))[0]))
    redirect(302, `${dealt.pathname}${dealt.search}`)
  }
  if (!listTag(script, filter) || facetTag(facet) === undefined || radicalTag(radical) === undefined || !markTags(within, without)) error(404)
  const exact = query.length <= SEARCH_LENGTH_MAX && exactSearchIds(query)
  const words = query.length <= SEARCH_LENGTH_MAX && !exact ? new Set(terms(query)) : new Set<string>()
  const searchError = query.length > SEARCH_LENGTH_MAX ? 'queryTooLong' : !exact && query && words.size === 0 ? 'noSearchTerms' : words.size > SEARCH_TERMS_MAX ? 'tooManyTerms' : null
  const db = env(event).DB
  // A record's code typed whole, R+0022 or 天天玄玄, opens the record it names.
  const coded = after === null ? parseRecordCode(query) : null
  // A merged record opens the one it was merged into, and neither may be hidden.
  const named = coded ? await db.prepare('SELECT COALESCE(m.id, e.id) AS id FROM entries e LEFT JOIN entries m ON m.id = e.merged_into WHERE e.id = ? AND e.hidden_at IS NULL AND (e.merged_into IS NULL OR m.hidden_at IS NULL)').bind(coded).first<{ id: number }>() : null
  if (named) redirect(303, `/${event.params.locale}/entry/${named.id}`)
  const [page, totals] = await Promise.all([searchError ? null : list(db, { script, filter, facet, radical, within, without, query, order, seed, after }), counts(db)])
  if (!page && !searchError) error(404)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page?.tiles ?? [], event.locals.glyphStyle)
  return { ...(page ?? { tiles: [], next: null, partial: false }), counts: totals, glyphs, filter, genre, collection, tag, radical: radical?.normalize('NFC') ?? null, within, without, query, searchError, order, seed, continued: after !== null && query.length > 0 }
}
