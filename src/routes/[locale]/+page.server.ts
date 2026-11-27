import { taxonomy } from '$lib/server/tags'
import { error, redirect } from '@sveltejs/kit'
import { alsoSearch, counts, creatorCounts, creatorTag, cursorOf, decadeTag, exactSearchIds, facetTag, list, listTag, markTags, pageCount, pageCursor, pageOf, radicalTag, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, searchTotal, terms } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import { tileGlyphs } from '$lib/server/glyphs'
import { parseRecordCode } from '$lib/code'
import { orderOf, pageSizeOf, seedOf } from '$lib/order'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const { searchParams } = event.url
  // A script keeps the list to the records written in it: ?script=nom. Without one, every script is listed.
  const script = searchParams.get('script') || null
  const filter = searchParams.get('filter') || null
  // A collection or a tag narrows the list: ?collection=, ?tag= (or legacy ?genre=).
  const genre = searchParams.get('genre'), collection = searchParams.get('collection'), rawTag = searchParams.get('tag')
  const requestedTag = (rawTag ?? genre)?.normalize('NFC') ?? null
  const rawFacet = collection ? `c:${collection}` : requestedTag ? `t:${requestedTag}` : null
  // A maker keeps the list to the records that name them as the one who made the character: ?creator=陸貫一.
  const requestedCreator = searchParams.get('creator')?.normalize('NFC').trim() || null
  // A radical keeps the list to the records filed under its path: ?radical=儿兄克.
  const radical = searchParams.get('radical') || null
  // A decade keeps the list to the records first seen in it: ?decade=1930.
  const decade = searchParams.get('decade') || null
  // A marked work keeps the list to the records in it or to the ones not in it: ?in=, ?out=, each as often as needed.
  const within = [...new Set(searchParams.getAll('in'))], without = [...new Set(searchParams.getAll('out'))]
  const query = (searchParams.get('q') ?? '').trim()
  // ?sort= names an order other than most evidence first; ?after= is the place a further page starts from.
  const order = orderOf(searchParams.get('sort'))
  const placed = searchParams.get('after')
  // ?page= opens a list at a numbered page, in place of ?after=.
  // ?per= names a page size other than the usual one.
  const per = pageSizeOf(searchParams.get('per'))
  const number = searchParams.get('page') ? pageOf(searchParams.get('page')) : 1
  if (!order || !cursorOf(order, placed) || number === null || per === null || (number > 1 && placed !== null)) error(404)
  // A shuffled list is dealt a random start once, and the address keeps it for its further pages.
  const seed = order === 'random' ? seedOf(searchParams.get('seed')) : null
  if (order === 'random' && seed === null) {
    if (searchParams.has('seed') || placed !== null) error(404)
    const dealt = new URL(event.url)
    dealt.searchParams.set('seed', String(crypto.getRandomValues(new Uint32Array(1))[0]))
    redirect(302, `${dealt.pathname}${dealt.search}`)
  }
  if (!listTag(script, filter) || facetTag(rawFacet) === undefined || creatorTag(requestedCreator) === undefined || radicalTag(radical) === undefined || decadeTag(decade) === undefined || !markTags(within, without)) error(404)
  const exact = query.length <= SEARCH_LENGTH_MAX && exactSearchIds(query)
  const words = query.length <= SEARCH_LENGTH_MAX && !exact ? new Set(terms(query)) : new Set<string>()
  const searchError = query.length > SEARCH_LENGTH_MAX ? 'queryTooLong' : !exact && query && words.size === 0 ? 'noSearchTerms' : words.size > SEARCH_TERMS_MAX ? 'tooManyTerms' : null
  const db = env(event).DB
  // A record's code typed whole, R+0022 or 天天玄玄, opens the record it names.
  const coded = placed === null && number === 1 ? parseRecordCode(query) : null
  // A merged record opens the one it was merged into, and neither may be hidden.
  const creator = creatorTag(requestedCreator)?.slice(2) ?? null
  const [{ tags, groups }, creators, named] = await Promise.all([
    taxonomy(db),
    creatorCounts(db),
    coded ? db.prepare('SELECT COALESCE(m.id, e.id) AS id FROM entries e LEFT JOIN entries m ON m.id = e.merged_into WHERE e.id = ? AND e.hidden_at IS NULL AND (e.merged_into IS NULL OR m.hidden_at IS NULL)').bind(coded).first<{ id: number }>() : null,
  ])
  const tag = requestedTag ? (tags.find(item => item.name === requestedTag || item.label === requestedTag || item.aliases.includes(requestedTag))?.name ?? requestedTag) : null
  const facet = collection ? `c:${collection}` : tag ? `t:${tag}` : null
  if (named) redirect(303, `/${event.params.locale}/entry/${named.id}`)
  // A whole description, or a query of parts alone, is also searched under the other spellings the browser found for it: ?also=, at most a few.
  const also = searchError ? [] : alsoSearch(query, searchParams.getAll('also'))
  const unplaced = { script, filter, facet, creator, radical, decade, within, without, query, also, order, seed, limit: per }
  // The pages are counted where the list is opened, not on the reads that add to it.
  const [start, counted] = searchError || placed !== null ? [null, null] : await Promise.all([pageCursor(db, unplaced, number), pageCount(db, unplaced)])
  const pages = counted?.pages ?? null
  if (start === undefined) {
    // A page past the last opens the last.
    if (!pages || number <= pages) error(404)
    const last = new URL(event.url)
    if (pages > 1) last.searchParams.set('page', String(pages)); else last.searchParams.delete('page')
    redirect(302, `${last.pathname}${last.search}`)
  }
  const after = start ?? placed
  const listing = { ...unplaced, after }
  // A search is counted on its first page; further pages are added to that one and keep its count.
  const [page, totals, total] = await Promise.all([searchError ? null : list(db, listing), counts(db), searchError || after !== null ? null : searchTotal(db, listing)])
  if (!page && !searchError) error(404)
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page?.tiles ?? [], event.locals.glyphStyle)
  return { ...(page ?? { tiles: [], next: null, partial: false, read: 0 }), counts: totals, tags, groups, total, pages, per, records: counted?.records ?? null, recordsFloor: counted?.floor ?? false, number, glyphs, script, filter, collection, tag, creator, creators, radical: radical?.normalize('NFC') ?? null, decade, within, without, query, also, searchError, order, seed, continued: after !== null && query.length > 0 }
}
