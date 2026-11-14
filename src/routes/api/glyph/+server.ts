import { json } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { cleanIds } from '$lib/ids'
import { env } from '$lib/server/guard'
import { drawGlyph } from '$lib/server/glyphs'
import type { RequestHandler } from './$types'

// A record's description drawn on demand: the page shows what is already cached, and asks here for
// the rest. Only a description on a visible record is drawn, so the route cannot be used as a
// general compositor.
export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('ids') ?? ''
  const ids = cleanIds(raw)
  if (raw.length > 200 || [...ids].length < 2 || !isDescription(ids)) return new Response(null, { status: 404 })
  const bindings = env(event)
  const visible = await bindings.DB.prepare('SELECT 1 FROM entries WHERE ids = ? AND hidden_at IS NULL AND merged_into IS NULL LIMIT 1').bind(ids).first()
  if (!visible) return new Response(null, { status: 404 })
  const path = await drawGlyph(bindings.MEDIA, ids, { assets: bindings.ASSETS, origin: event.url.origin })
  if (!path) return new Response(null, { status: 404 })
  return json({ d: path }, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
}
