import { json } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { composerDrawing, glyphStyleOf } from '$lib/composer'
import { cleanIds } from '$lib/ids'
import { cleanLayout, layoutText } from '$lib/layout'
import { env } from '$lib/server/guard'
import { drawGlyph } from '$lib/server/glyphs'
import type { RequestHandler } from './$types'

// A record's description drawn on demand, with the record's layout when it has one: the page shows
// what is already cached, and asks here for the rest. Only the descriptions a visible record states
// draw, each with its own layout, so the route cannot be used as a general compositor.
export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('ids') ?? '', given = event.url.searchParams.get('layout') ?? ''
  const asked = event.url.searchParams.get('style'), style = glyphStyleOf(asked)
  if (asked !== null && asked !== style) return new Response(null, { status: 404 })
  // The address names the export and the composer, and the answer is cached for a year: a drawing
  // made by another of either must not answer for this one.
  if (event.url.searchParams.get('v') !== composerDrawing(style)) return new Response(null, { status: 404 })
  const ids = cleanIds(raw)
  if (raw.length > 200 || given.length > 8000 || [...ids].length < 2 || !isDescription(ids)) return new Response(null, { status: 404 })
  const layout = layoutText(cleanLayout(given, ids)) || null
  if (given && !layout) return new Response(null, { status: 404 })
  const bindings = env(event)
  // A record states each description it holds as a claim. A drawing without a layout matches a claim
  // that states none; a layout matches the one stored with that description.
  const visible = await bindings.DB.prepare(`SELECT 1 FROM claims k CROSS JOIN entries e ON e.id = k.entry_id WHERE k.kind = 'ids' AND k.value = ? AND e.hidden_at IS NULL AND e.merged_into IS NULL AND json_extract(k.data, '$.layout') IS ? LIMIT 1`).bind(ids, layout).first()
  if (!visible) return new Response(null, { status: 404 })
  const path = await drawGlyph(bindings.MEDIA, { ids, layout }, { assets: bindings.ASSETS, origin: event.url.origin, style })
  if (!path) return new Response(null, { status: 404 })
  return json({ d: path }, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
}
