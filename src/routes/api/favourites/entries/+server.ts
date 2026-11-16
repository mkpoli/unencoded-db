import { error, json } from '@sveltejs/kit'
import { FAVOURITES_PAGE, favouriteEntries } from '$lib/server/favourites'
import { tileGlyphs } from '$lib/server/glyphs'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

const PRIVATE = { 'cache-control': 'private, no-store' }

function nonNegativeInt(raw: string | null, fallback: number) {
  if (raw === null) return fallback
  if (!/^\d{1,9}$/.test(raw)) return null
  return Number(raw)
}

export const GET: RequestHandler = async (event) => {
  const offset = nonNegativeInt(event.url.searchParams.get('offset'), 0)
  const limit = nonNegativeInt(event.url.searchParams.get('limit'), FAVOURITES_PAGE)
  if (offset === null || limit === null || limit < 1) error(400, 'Invalid pagination parameters')
  const person = event.locals.person
  if (!person) return json({ tiles: [], glyphs: {}, total: 0, offset, next: null }, { headers: PRIVATE })
  const page = await favouriteEntries(env(event).DB, person.id, offset, Math.min(limit, FAVOURITES_PAGE))
  const glyphs = await tileGlyphs(event.platform, event.url.origin, page.tiles, event.locals.glyphStyle)
  return json({ ...page, glyphs }, { headers: PRIVATE })
}
