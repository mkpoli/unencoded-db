import { error, json } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { cleanIds } from '$lib/ids'
import { drawGlyph } from '$lib/server/glyphs'
import type { RequestHandler } from './$types'

// A record's description drawn on demand: the page shows what is already cached, and asks here for
// the rest. Only a description on a visible record is drawn, so the route cannot be used as a
// general compositor.
export const GET: RequestHandler = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const raw = url.searchParams.get('ids') ?? ''
  const stored = raw.normalize('NFC').trim()
  const ids = cleanIds(stored)
  if (raw.length > 200 || [...ids].length < 2 || !isDescription(ids)) return new Response(null, { status: 404 })
  const visible = await platform.env.DB.prepare(`SELECT 1 FROM entry_ids x JOIN entries e ON e.id = x.entry_id WHERE e.visible = 1 AND x.ids = ? LIMIT 1`).bind(stored).first()
  if (!visible) return new Response(null, { status: 404 })
  const path = await drawGlyph(platform.env.IMAGES, ids)
  if (!path) return new Response(null, { status: 404 })
  return json({ d: path }, { headers: { 'cache-control': 'public, max-age=31536000, immutable' } })
}
