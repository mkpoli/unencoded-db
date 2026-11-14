import { json } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { cleanIds } from '$lib/ids'
import { cleanLayout, layoutText } from '$lib/layout'
import { env } from '$lib/server/guard'
import { drawGlyph } from '$lib/server/glyphs'
import type { RequestHandler } from './$types'

// A record's description drawn on demand, with the record's layout when it has one: the page shows
// what is already cached, and asks here for the rest. Only what a visible record draws is drawn, so
// the route cannot be used as a general compositor.
export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('ids') ?? '', given = event.url.searchParams.get('layout') ?? ''
  const ids = cleanIds(raw)
  if (raw.length > 200 || given.length > 8000 || [...ids].length < 2 || !isDescription(ids)) return new Response(null, { status: 404 })
  const layout = layoutText(cleanLayout(given, ids)) || null
  if (given && !layout) return new Response(null, { status: 404 })
  const bindings = env(event)
  const visible = await bindings.DB.prepare('SELECT 1 FROM entries WHERE ids = ? AND layout IS ? AND hidden_at IS NULL AND merged_into IS NULL LIMIT 1').bind(ids, layout).first()
  if (!visible) return new Response(null, { status: 404 })
  const path = await drawGlyph(bindings.MEDIA, { ids, layout })
  if (!path) return new Response(null, { status: 404 })
  return json({ d: path }, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
}
